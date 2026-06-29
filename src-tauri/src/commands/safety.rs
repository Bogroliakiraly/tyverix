//! Safety net: System Restore points, registry backups and the undo system.

use tauri::State;

use crate::commands::{power, startup};
use crate::error::{AppError, AppResult};
use crate::state::{ActionRecord, AppState};
use crate::util::{app_data_dir, run_command, run_powershell};

#[tauri::command]
pub fn create_restore_point(description: String) -> AppResult<String> {
    // Checkpoint-Computer needs admin + System Restore enabled. By default
    // Windows throttles to one point per 24h; we clear that limit for this call
    // so a pre-operation checkpoint is reliable.
    let script = format!(
        r#"
$ErrorActionPreference='Stop'
try {{
  New-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore" -Name "SystemRestorePointCreationFrequency" -Value 0 -PropertyType DWord -Force | Out-Null
}} catch {{}}
Checkpoint-Computer -Description "{}" -RestorePointType "MODIFY_SETTINGS"
"Restore point created"
"#,
        description.replace('"', "'")
    );
    run_powershell(&script).map(|_| "Restore point created".to_string())
}

#[tauri::command]
pub fn backup_registry() -> AppResult<String> {
    let dir = app_data_dir()?.join("registry-backups");
    std::fs::create_dir_all(&dir)?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();

    let targets = [
        (
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            format!("hkcu-run-{stamp}.reg"),
        ),
        (
            r"HKLM\Software\Microsoft\Windows\CurrentVersion\Run",
            format!("hklm-run-{stamp}.reg"),
        ),
    ];

    let mut exported = 0;
    for (key, file) in targets {
        let path = dir.join(&file);
        // reg.exe export may fail for HKLM without admin — that is non-fatal.
        if run_command("reg", &["export", key, &path.to_string_lossy(), "/y"]).is_ok() {
            exported += 1;
        }
    }
    if exported == 0 {
        return Err(AppError::other(
            "no registry keys could be exported (try running as administrator)",
        ));
    }
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_action_log(state: State<AppState>) -> AppResult<Vec<ActionRecord>> {
    let log = state
        .actions
        .lock()
        .map_err(|_| AppError::other("action log locked"))?;
    Ok(log.clone())
}

#[tauri::command]
pub fn undo_action(state: State<AppState>, id: String) -> AppResult<()> {
    let rec = {
        let log = state
            .actions
            .lock()
            .map_err(|_| AppError::other("action log locked"))?;
        log.iter()
            .find(|r| r.id == id)
            .cloned()
            .ok_or_else(|| AppError::other("action not found"))?
    };

    if rec.undone {
        return Err(AppError::other("this action was already reverted"));
    }

    match rec.kind.as_str() {
        "startup_toggle" => {
            let item_id = rec.payload["id"]
                .as_str()
                .ok_or_else(|| AppError::other("missing payload"))?;
            let restore_enabled = rec.payload["restore_enabled"].as_bool().unwrap_or(true);
            startup::apply_raw(item_id, restore_enabled)?;
        }
        "power_plan" | "game_mode" => {
            let prev = rec.payload["previous_guid"]
                .as_str()
                .ok_or_else(|| AppError::other("missing previous plan"))?;
            power::set_active(prev)?;
            if rec.kind == "game_mode" {
                if let Ok(mut game) = state.game.lock() {
                    game.active = false;
                    game.applied_plan = None;
                    game.previous_plan = None;
                }
            }
        }
        other => return Err(AppError::other(format!("cannot undo action: {other}"))),
    }

    state.mark_undone(&id);
    Ok(())
}
