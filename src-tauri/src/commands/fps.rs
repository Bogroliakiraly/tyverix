//! Real FPS measurement via Intel PresentMon (bundled, MIT licensed — see
//! bin/PresentMon-LICENSE.txt). PresentMon reads Windows' own ETW present
//! events, so every number shown is a measured frame time, never an estimate.
//! If capture cannot start (e.g. the app is not elevated), an honest error is
//! returned instead of a made-up value.

use std::io::{BufRead, BufReader, Read};
use std::os::windows::process::CommandExt;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::path::BaseDirectory;
use tauri::{Emitter, Manager};

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::util::blocking;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct FpsSession {
    child: Child,
    stop: Arc<AtomicBool>,
}

/// One session at a time; stored here (not in AppState) so state.rs stays
/// independent of this module.
static SESSION: Mutex<Option<FpsSession>> = Mutex::new(None);

#[derive(Serialize)]
pub struct FpsTarget {
    pub pid: u32,
    pub label: String,
}

/// Live sample emitted to the UI every ~500 ms while measuring.
#[derive(Clone, Serialize)]
struct FpsSample {
    process: String,
    /// Average FPS over roughly the last second.
    fps: f64,
    /// Average frame time (ms) over the same window.
    frame_time_ms: f64,
    /// "1% low" FPS over the whole run so far (99th-percentile frame time).
    fps_low_1: f64,
    frames: u64,
    elapsed_secs: f64,
}

#[derive(Clone, Serialize)]
struct FpsEnded {
    process: String,
    reason: String,
}

/// Running, known game processes that can be measured.
#[tauri::command]
pub async fn list_fps_targets(app: tauri::AppHandle) -> AppResult<Vec<FpsTarget>> {
    blocking(move || {
        let state = app.state::<AppState>();
        Ok(super::power::detect_game_processes(&state)
            .into_iter()
            .map(|g| FpsTarget {
                pid: g.pid,
                label: g.label,
            })
            .collect())
    })
    .await
}

#[tauri::command]
pub async fn start_fps_measure(app: tauri::AppHandle, pid: u32, label: String) -> AppResult<()> {
    blocking(move || {
        // Only one capture at a time — stop a previous one quietly.
        stop_session();

        let exe = app
            .path()
            .resolve("bin/PresentMon-x64.exe", BaseDirectory::Resource)
            .map_err(|e| AppError::other(format!("PresentMon not found: {e}")))?;

        let mut child = Command::new(&exe)
            .args([
                "--process_id",
                &pid.to_string(),
                "--output_stdout",
                "--no_console_stats",
                "--stop_existing_session",
                "--terminate_on_proc_exit",
                "--v2_metrics",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| AppError::Command(format!("failed to start PresentMon: {e}")))?;

        let stdout = child.stdout.take().expect("piped stdout");
        let stderr = child.stderr.take().expect("piped stderr");

        let stderr_buf = Arc::new(Mutex::new(String::new()));
        {
            let buf = stderr_buf.clone();
            std::thread::spawn(move || {
                let mut s = String::new();
                let mut r = BufReader::new(stderr);
                let _ = r.read_to_string(&mut s);
                if let Ok(mut b) = buf.lock() {
                    *b = s;
                }
            });
        }

        let stop = Arc::new(AtomicBool::new(false));
        spawn_reader(app.clone(), stdout, stop.clone(), label);

        // ETW capture failures (no admin rights, session conflicts) surface as
        // an immediate exit — catch that here so the UI gets a clear error
        // instead of a measurement that silently never produces frames.
        std::thread::sleep(Duration::from_millis(1200));
        if let Ok(Some(_)) = child.try_wait() {
            stop.store(true, Ordering::Relaxed);
            let err = stderr_buf.lock().map(|s| s.trim().to_string()).unwrap_or_default();
            return Err(AppError::Command(if err.is_empty() {
                "PresentMon exited immediately — measuring usually requires running Tyverix as administrator".into()
            } else {
                err
            }));
        }

        if let Ok(mut slot) = SESSION.lock() {
            *slot = Some(FpsSession { child, stop });
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn stop_fps_measure() -> AppResult<()> {
    blocking(move || {
        stop_session();
        Ok(())
    })
    .await
}

/// Kills any running capture. Also called from the app-exit hook in lib.rs so
/// no orphaned PresentMon process or ETW session outlives the app.
pub(crate) fn stop_session() {
    if let Ok(mut slot) = SESSION.lock() {
        if let Some(mut s) = slot.take() {
            s.stop.store(true, Ordering::Relaxed);
            let _ = s.child.kill();
            let _ = s.child.wait();
        }
    }
}

/// Parses PresentMon's CSV stream and emits `fps-sample` events. Column
/// positions are taken from the header row, supporting both the v2 metric
/// name (`FrameTime`) and the v1 fallback (`msBetweenPresents`).
fn spawn_reader(
    app: tauri::AppHandle,
    stdout: impl Read + Send + 'static,
    stop: Arc<AtomicBool>,
    label: String,
) {
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut ft_col: Option<usize> = None;
        let mut all_ft: Vec<f64> = Vec::new();
        let mut window: Vec<(Instant, f64)> = Vec::new();
        let started = Instant::now();
        let mut last_emit = Instant::now();

        for line in reader.lines() {
            if stop.load(Ordering::Relaxed) {
                return;
            }
            let Ok(line) = line else { break };

            let Some(col) = ft_col else {
                // Header row.
                ft_col = line.split(',').position(|h| {
                    let h = h.trim();
                    h.eq_ignore_ascii_case("FrameTime")
                        || h.eq_ignore_ascii_case("msBetweenPresents")
                });
                continue;
            };

            let Some(ft) = line.split(',').nth(col).and_then(|v| v.trim().parse::<f64>().ok())
            else {
                continue;
            };
            if !(ft.is_finite() && ft > 0.0) {
                continue;
            }

            let now = Instant::now();
            all_ft.push(ft);
            window.push((now, ft));
            window.retain(|(t, _)| now.duration_since(*t) < Duration::from_secs(1));

            if now.duration_since(last_emit) >= Duration::from_millis(500) && !window.is_empty() {
                last_emit = now;
                let avg_ft = window.iter().map(|(_, f)| f).sum::<f64>() / window.len() as f64;

                // 99th-percentile frame time over the whole run = "1% low" FPS.
                let mut sorted = all_ft.clone();
                let idx = ((sorted.len() as f64) * 0.99) as usize;
                let idx = idx.min(sorted.len() - 1);
                let (_, p99, _) = sorted.select_nth_unstable_by(idx, |a, b| {
                    a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal)
                });
                let p99 = *p99;

                let _ = app.emit(
                    "fps-sample",
                    FpsSample {
                        process: label.clone(),
                        fps: 1000.0 / avg_ft,
                        frame_time_ms: avg_ft,
                        fps_low_1: if p99 > 0.0 { 1000.0 / p99 } else { 0.0 },
                        frames: all_ft.len() as u64,
                        elapsed_secs: started.elapsed().as_secs_f64(),
                    },
                );
            }
        }

        if !stop.load(Ordering::Relaxed) {
            let _ = app.emit(
                "fps-ended",
                FpsEnded {
                    process: label,
                    reason: "ended".into(),
                },
            );
        }
    });
}
