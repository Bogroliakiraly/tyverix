//! Startup application manager.
//!
//! Reversibility is the whole point here: disabling a registry entry does not
//! delete it. Instead Tyverix moves the value into a private backup key
//! (`HKCU\Software\Tyverix\DisabledStartup`) and can restore it byte-for-byte.
//! Startup-folder shortcuts are moved into a "(disabled)" sub-folder.

use serde::Serialize;
use tauri::State;
use winreg::enums::*;
use winreg::RegKey;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

const RUN_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const BACKUP_HKCU: &str = r"Software\Tyverix\DisabledStartup\HKCU";
const BACKUP_HKLM: &str = r"Software\Tyverix\DisabledStartup\HKLM";

#[derive(Serialize)]
pub struct StartupItem {
    pub id: String,
    pub name: String,
    pub command: String,
    pub location: String,
    pub enabled: bool,
    pub source: String,
}

fn run_values(root: RegKey, path: &str) -> Vec<(String, String)> {
    match root.open_subkey(path) {
        Ok(key) => key
            .enum_values()
            .filter_map(|res| res.ok())
            .map(|(name, value)| (name, value.to_string()))
            .collect(),
        Err(_) => Vec::new(),
    }
}

#[tauri::command]
pub fn list_startup_items() -> AppResult<Vec<StartupItem>> {
    let mut items = Vec::new();
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    // Enabled registry entries.
    for (name, cmd) in run_values(RegKey::predef(HKEY_CURRENT_USER), RUN_PATH) {
        items.push(StartupItem {
            id: format!("hr::{name}"),
            name: name.clone(),
            command: cmd,
            location: "registry_hkcu_run".into(),
            enabled: true,
            source: "Current user".into(),
        });
    }
    for (name, cmd) in run_values(RegKey::predef(HKEY_LOCAL_MACHINE), RUN_PATH) {
        items.push(StartupItem {
            id: format!("mr::{name}"),
            name: name.clone(),
            command: cmd,
            location: "registry_hklm_run".into(),
            enabled: true,
            source: "All users".into(),
        });
    }

    // Disabled entries we previously backed up.
    for (name, cmd) in run_values(hkcu, BACKUP_HKCU) {
        items.push(StartupItem {
            id: format!("hr::{name}"),
            name: name.clone(),
            command: cmd,
            location: "registry_hkcu_run".into(),
            enabled: false,
            source: "Current user".into(),
        });
    }
    for (name, cmd) in run_values(hklm, BACKUP_HKLM) {
        items.push(StartupItem {
            id: format!("mr::{name}"),
            name: name.clone(),
            command: cmd,
            location: "registry_hklm_run".into(),
            enabled: false,
            source: "All users".into(),
        });
    }

    // Startup-folder shortcuts.
    collect_folder(&mut items, startup_folder_user(), "uf", "Startup folder (user)");
    collect_folder(
        &mut items,
        startup_folder_common(),
        "cf",
        "Startup folder (all users)",
    );

    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(items)
}

#[tauri::command]
pub fn set_startup_enabled(
    state: State<AppState>,
    id: String,
    enabled: bool,
) -> AppResult<()> {
    let (code, name) = id
        .split_once("::")
        .ok_or_else(|| AppError::other("malformed startup id"))?;

    match code {
        "hr" => toggle_registry(
            RegKey::predef(HKEY_CURRENT_USER),
            RUN_PATH,
            BACKUP_HKCU,
            name,
            enabled,
        )?,
        "mr" => toggle_registry(
            RegKey::predef(HKEY_LOCAL_MACHINE),
            RUN_PATH,
            BACKUP_HKLM,
            name,
            enabled,
        )?,
        "uf" => toggle_folder(startup_folder_user(), name, enabled)?,
        "cf" => toggle_folder(startup_folder_common(), name, enabled)?,
        _ => return Err(AppError::other("unknown startup location")),
    }

    state.record(
        "startup_toggle",
        format!(
            "{} startup item “{name}”",
            if enabled { "Enabled" } else { "Disabled" }
        ),
        serde_json::json!({ "id": id, "restore_enabled": !enabled }),
    );
    Ok(())
}

/// Re-applies the opposite of a recorded toggle. Used by the undo system; does
/// not itself create a new log entry.
pub fn apply_raw(id: &str, enabled: bool) -> AppResult<()> {
    let (code, name) = id
        .split_once("::")
        .ok_or_else(|| AppError::other("malformed startup id"))?;
    match code {
        "hr" => toggle_registry(
            RegKey::predef(HKEY_CURRENT_USER),
            RUN_PATH,
            BACKUP_HKCU,
            name,
            enabled,
        ),
        "mr" => toggle_registry(
            RegKey::predef(HKEY_LOCAL_MACHINE),
            RUN_PATH,
            BACKUP_HKLM,
            name,
            enabled,
        ),
        "uf" => toggle_folder(startup_folder_user(), name, enabled),
        "cf" => toggle_folder(startup_folder_common(), name, enabled),
        _ => Err(AppError::other("unknown startup location")),
    }
}

fn toggle_registry(
    root: RegKey,
    run_path: &str,
    backup_path: &str,
    name: &str,
    enable: bool,
) -> AppResult<()> {
    let map_err = |e: std::io::Error| AppError::Registry(e.to_string());

    if enable {
        // Move the value from the backup key back into Run.
        let backup = root.open_subkey_with_flags(backup_path, KEY_ALL_ACCESS);
        let value: String = match backup {
            Ok(ref k) => k.get_value(name).map_err(map_err)?,
            Err(_) => return Err(AppError::other("no backup found to restore")),
        };
        let (run, _) = root
            .create_subkey(run_path)
            .map_err(map_err)?;
        run.set_value(name, &value).map_err(map_err)?;
        if let Ok(k) = backup {
            let _ = k.delete_value(name);
        }
    } else {
        // Copy the value into the backup key, then remove it from Run.
        let run = root
            .open_subkey_with_flags(run_path, KEY_ALL_ACCESS)
            .map_err(map_err)?;
        let value: String = run.get_value(name).map_err(map_err)?;
        let (backup, _) = root.create_subkey(backup_path).map_err(map_err)?;
        backup.set_value(name, &value).map_err(map_err)?;
        run.delete_value(name).map_err(map_err)?;
    }
    Ok(())
}

fn collect_folder(items: &mut Vec<StartupItem>, dir: Option<std::path::PathBuf>, code: &str, source: &str) {
    let Some(dir) = dir else { return };
    push_shortcuts(items, &dir, code, source, true);
    let disabled = dir.join("Tyverix (disabled)");
    push_shortcuts(items, &disabled, code, source, false);
}

fn push_shortcuts(
    items: &mut Vec<StartupItem>,
    dir: &std::path::Path,
    code: &str,
    source: &str,
    enabled: bool,
) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("lnk") {
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            items.push(StartupItem {
                id: format!("{code}::{name}"),
                name: name.clone(),
                command: path.to_string_lossy().to_string(),
                location: if code == "uf" {
                    "startup_folder_user".into()
                } else {
                    "startup_folder_common".into()
                },
                enabled,
                source: source.into(),
            });
        }
    }
}

fn toggle_folder(dir: Option<std::path::PathBuf>, name: &str, enable: bool) -> AppResult<()> {
    let dir = dir.ok_or_else(|| AppError::other("startup folder not found"))?;
    let disabled = dir.join("Tyverix (disabled)");
    let file = format!("{name}.lnk");
    if enable {
        std::fs::create_dir_all(&dir)?;
        std::fs::rename(disabled.join(&file), dir.join(&file))?;
    } else {
        std::fs::create_dir_all(&disabled)?;
        std::fs::rename(dir.join(&file), disabled.join(&file))?;
    }
    Ok(())
}

fn startup_folder_user() -> Option<std::path::PathBuf> {
    std::env::var("APPDATA").ok().map(|p| {
        std::path::PathBuf::from(p)
            .join(r"Microsoft\Windows\Start Menu\Programs\Startup")
    })
}

fn startup_folder_common() -> Option<std::path::PathBuf> {
    std::env::var("PROGRAMDATA").ok().map(|p| {
        std::path::PathBuf::from(p)
            .join(r"Microsoft\Windows\Start Menu\Programs\Startup")
    })
}
