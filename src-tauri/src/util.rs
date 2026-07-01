//! Small cross-cutting helpers: running PowerShell safely, locating the app
//! data directory and parsing PowerShell's JSON output robustly.

use std::io::Read;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use serde::de::DeserializeOwned;

use crate::error::{AppError, AppResult};

/// Hides the transient console window PowerShell would otherwise flash.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Default ceiling for a PowerShell call. A WMI query or a locked-down/managed
/// machine can otherwise hang the underlying process indefinitely, which used
/// to freeze the calling page's spinner forever ("this page just never
/// loads"). Past this, the process is killed and a clear error is returned
/// instead of blocking forever.
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(15);

/// Runs a PowerShell snippet and returns its stdout, bounded by
/// [`DEFAULT_TIMEOUT`]. Errors carry stderr so the UI can show why something
/// failed (e.g. "requires administrator").
pub fn run_powershell(script: &str) -> AppResult<String> {
    run_powershell_timeout(script, DEFAULT_TIMEOUT)
}

/// Like [`run_powershell`] but with an explicit timeout, for calls known to
/// legitimately take longer (e.g. the Windows Update agent).
pub fn run_powershell_timeout(script: &str, timeout: Duration) -> AppResult<String> {
    let mut child = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    // Read stdout/stderr on background threads so a full pipe buffer can
    // never deadlock the wait loop below (the classic exec pipe deadlock).
    let mut stdout_pipe = child.stdout.take().expect("piped stdout");
    let mut stderr_pipe = child.stderr.take().expect("piped stderr");
    let (out_tx, out_rx) = mpsc::channel();
    let (err_tx, err_rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout_pipe.read_to_end(&mut buf);
        let _ = out_tx.send(buf);
    });
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stderr_pipe.read_to_end(&mut buf);
        let _ = err_tx.send(buf);
    });

    let deadline = Instant::now() + timeout;
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break status;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(AppError::Command(
                "PowerShell timed out — the system took too long to respond".into(),
            ));
        }
        std::thread::sleep(Duration::from_millis(40));
    };

    let stdout_buf = out_rx.recv_timeout(Duration::from_secs(2)).unwrap_or_default();
    let stderr_buf = err_rx.recv_timeout(Duration::from_secs(2)).unwrap_or_default();

    if !status.success() {
        let err = String::from_utf8_lossy(&stderr_buf).trim().to_string();
        return Err(AppError::Command(if err.is_empty() {
            "PowerShell returned a non-zero exit code".into()
        } else {
            err
        }));
    }
    Ok(String::from_utf8_lossy(&stdout_buf).to_string())
}

/// Runs an arbitrary executable, returning trimmed stdout.
pub fn run_command(program: &str, args: &[&str]) -> AppResult<String> {
    let output = Command::new(program)
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::Command(format!("{program} failed: {err}")));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Parses PowerShell `ConvertTo-Json` output into a `Vec<T>`.
///
/// PowerShell collapses single-element collections into a bare object, so we
/// branch on the first non-whitespace character instead of assuming an array.
pub fn parse_ps_array<T: DeserializeOwned>(json: &str) -> AppResult<Vec<T>> {
    let trimmed = json.trim();
    if trimmed.is_empty() || trimmed == "null" {
        return Ok(Vec::new());
    }
    if trimmed.starts_with('[') {
        serde_json::from_str(trimmed).map_err(|e| AppError::Parse(e.to_string()))
    } else {
        let single: T =
            serde_json::from_str(trimmed).map_err(|e| AppError::Parse(e.to_string()))?;
        Ok(vec![single])
    }
}

/// Returns `%LOCALAPPDATA%\Tyverix`, creating it if necessary.
pub fn app_data_dir() -> AppResult<PathBuf> {
    let base = std::env::var("LOCALAPPDATA")
        .map_err(|_| AppError::other("LOCALAPPDATA is not set"))?;
    let dir = PathBuf::from(base).join("Tyverix");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}
