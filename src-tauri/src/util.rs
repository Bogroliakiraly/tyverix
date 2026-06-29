//! Small cross-cutting helpers: running PowerShell safely, locating the app
//! data directory and parsing PowerShell's JSON output robustly.

use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

use serde::de::DeserializeOwned;

use crate::error::{AppError, AppResult};

/// Hides the transient console window PowerShell would otherwise flash.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Runs a PowerShell snippet and returns its stdout. Errors carry stderr so
/// the UI can show why something failed (e.g. "requires administrator").
pub fn run_powershell(script: &str) -> AppResult<String> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::Command(if err.is_empty() {
            "PowerShell returned a non-zero exit code".into()
        } else {
            err
        }));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
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

/// Returns `%LOCALAPPDATA%\BoostForge`, creating it if necessary.
pub fn app_data_dir() -> AppResult<PathBuf> {
    let base = std::env::var("LOCALAPPDATA")
        .map_err(|_| AppError::other("LOCALAPPDATA is not set"))?;
    let dir = PathBuf::from(base).join("BoostForge");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}
