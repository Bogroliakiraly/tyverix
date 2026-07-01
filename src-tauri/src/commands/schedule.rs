//! Scheduled automatic cleanup, built on the same vetted targets as the
//! manual cleaner (`commands::cleaner`) — never anything new or riskier.
//! The schedule itself is a normal Windows Task Scheduler entry (`schtasks`),
//! so it is fully visible and removable outside Tyverix too, and it
//! launches Tyverix with `--auto-clean`, which runs headlessly and exits.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::commands::cleaner::{clean_targets_impl, CleanResult};
use crate::error::{AppError, AppResult};
use crate::util::{app_data_dir, run_command};

const TASK_NAME: &str = "Tyverix Auto Clean";

#[derive(Serialize, Deserialize, Clone)]
pub struct CleanupSchedule {
    pub enabled: bool,
    pub time: String, // "HH:MM", 24h
    pub target_ids: Vec<String>,
}

impl Default for CleanupSchedule {
    fn default() -> Self {
        Self {
            enabled: false,
            time: "03:00".into(),
            target_ids: vec!["user_temp".into(), "windows_temp".into(), "shader_cache".into()],
        }
    }
}

#[derive(Serialize, Deserialize, Default)]
struct CleanupLog {
    last_run: Option<String>,
    freed_bytes: Option<u64>,
    removed_files: Option<u64>,
}

#[derive(Serialize)]
pub struct CleanupScheduleStatus {
    pub schedule: CleanupSchedule,
    pub last_run: Option<String>,
    pub last_freed_bytes: Option<u64>,
    pub last_removed_files: Option<u64>,
}

fn schedule_path() -> AppResult<PathBuf> {
    Ok(app_data_dir()?.join("cleanup_schedule.json"))
}

fn log_path() -> AppResult<PathBuf> {
    Ok(app_data_dir()?.join("auto_clean_log.json"))
}

pub fn read_schedule() -> AppResult<CleanupSchedule> {
    let path = schedule_path()?;
    if !path.exists() {
        return Ok(CleanupSchedule::default());
    }
    let text = std::fs::read_to_string(path)?;
    serde_json::from_str(&text).map_err(|e| AppError::Parse(e.to_string()))
}

fn write_schedule(s: &CleanupSchedule) -> AppResult<()> {
    let text = serde_json::to_string_pretty(s).map_err(|e| AppError::Parse(e.to_string()))?;
    std::fs::write(schedule_path()?, text)?;
    Ok(())
}

fn read_log() -> CleanupLog {
    log_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

pub fn write_log(result: &CleanResult) -> AppResult<()> {
    let log = CleanupLog {
        last_run: Some(chrono::Local::now().to_rfc3339()),
        freed_bytes: Some(result.freed_bytes),
        removed_files: Some(result.removed_files),
    };
    let text = serde_json::to_string_pretty(&log).map_err(|e| AppError::Parse(e.to_string()))?;
    std::fs::write(log_path()?, text)?;
    Ok(())
}

fn status_from(schedule: CleanupSchedule) -> CleanupScheduleStatus {
    let log = read_log();
    CleanupScheduleStatus {
        schedule,
        last_run: log.last_run,
        last_freed_bytes: log.freed_bytes,
        last_removed_files: log.removed_files,
    }
}

#[tauri::command]
pub async fn get_cleanup_schedule() -> AppResult<CleanupScheduleStatus> {
    crate::util::blocking(move || Ok(status_from(read_schedule()?))).await
}

#[tauri::command]
pub async fn set_cleanup_schedule(
    enabled: bool,
    time: String,
    target_ids: Vec<String>,
) -> AppResult<CleanupScheduleStatus> {
    crate::util::blocking(move || {
        if !is_valid_time(&time) {
            return Err(AppError::other("Time must be in HH:MM 24-hour format"));
        }
        let schedule = CleanupSchedule {
            enabled,
            time: time.clone(),
            target_ids,
        };
        write_schedule(&schedule)?;

        if enabled {
            let exe = std::env::current_exe()?;
            let exe = exe.to_string_lossy().to_string();
            let action = format!("\"{exe}\" --auto-clean");
            run_command(
                "schtasks",
                &[
                    "/create", "/tn", TASK_NAME, "/tr", &action, "/sc", "daily", "/st", &time,
                    "/f",
                ],
            )?;
        } else {
            // Best-effort: the task may not exist yet, which is not an error here.
            let _ = run_command("schtasks", &["/delete", "/tn", TASK_NAME, "/f"]);
        }

        Ok(status_from(schedule))
    })
    .await
}

#[tauri::command]
pub async fn run_scheduled_cleanup_now() -> AppResult<CleanResult> {
    crate::util::blocking(move || {
        let schedule = read_schedule()?;
        let result = clean_targets_impl(schedule.target_ids, |_, _, _, _| {})?;
        write_log(&result)?;
        Ok(result)
    })
    .await
}

fn is_valid_time(time: &str) -> bool {
    let Some((h, m)) = time.split_once(':') else {
        return false;
    };
    matches!((h.parse::<u32>(), m.parse::<u32>()), (Ok(h), Ok(m)) if h < 24 && m < 60)
}

/// Invoked by `main`/`lib` when the process was launched by the scheduled
/// task (`--auto-clean`). Runs headlessly: no window, no Tauri runtime.
pub fn run_headless_auto_clean() {
    let Ok(schedule) = read_schedule() else { return };
    if !schedule.enabled || schedule.target_ids.is_empty() {
        return;
    }
    if let Ok(result) = clean_targets_impl(schedule.target_ids.clone(), |_, _, _, _| {}) {
        let _ = write_log(&result);
    }
}
