//! Startup application manager.
//!
//! Tyverix disables a startup entry exactly the way Windows' own Task Manager
//! does: the `Run` value (or the Startup-folder shortcut) is left untouched and
//! a flag is written to `...\Explorer\StartupApproved\{Run,StartupFolder}`
//! instead.
//!
//! This matters for more than tidiness. The previous implementation *removed*
//! the value from `Run` and kept a private backup. Many launchers (Steam,
//! Discord, the NVIDIA/Epic helpers) notice the missing value on their next
//! launch and silently re-create it — and on Windows 11 every re-created value
//! raises the "a new startup app was added" notification that drops the user
//! into Task Manager's *Startup apps* page at the next sign-in. Flagging the
//! entry as disabled keeps the value in place, so nothing re-adds itself and
//! nothing pops up at boot, while Task Manager and Tyverix always agree about
//! what is enabled.
//!
//! Entries disabled by older Tyverix versions (`HKCU\Software\Tyverix\
//! DisabledStartup`, and the "Tyverix (disabled)" shortcut folder) are still
//! listed and are migrated back into place the moment they are re-enabled.

use std::collections::HashSet;

use serde::Serialize;
use tauri::Manager;
use winreg::enums::*;
use winreg::{RegKey, RegValue, HKEY};

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::util::blocking;

const RUN_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
/// Windows' own enabled/disabled flags for `Run` values — HKCU for the current
/// user's entries, HKLM for the machine-wide ones. Task Manager writes here.
const APPROVED_RUN: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
/// Same idea for Startup-folder shortcuts; the value name is the file name
/// including the `.lnk` extension.
const APPROVED_FOLDER: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder";
/// Legacy locations, kept readable so older disables can still be undone.
const BACKUP_HKCU: &str = r"Software\Tyverix\DisabledStartup\HKCU";
const BACKUP_HKLM: &str = r"Software\Tyverix\DisabledStartup\HKLM";
const LEGACY_DISABLED_DIR: &str = "Tyverix (disabled)";

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

/// Reads Windows' startup-approval flag. The low bit of the first byte is the
/// disabled bit (`02`/`06` = enabled, `03`/`07` = disabled); a missing value
/// means "never touched", i.e. enabled.
fn approval_enabled(root: RegKey, approved_path: &str, name: &str) -> bool {
    root.open_subkey(approved_path)
        .ok()
        .and_then(|key| key.get_raw_value(name).ok())
        .and_then(|v| v.bytes.first().copied())
        .map(|first| first & 1 == 0)
        .unwrap_or(true)
}

/// Writes Windows' startup-approval flag, preserving whatever the existing
/// value said apart from the disabled bit. Disabling also stamps the current
/// time into bytes 4..12, exactly as Task Manager does.
fn set_approval(root: RegKey, approved_path: &str, name: &str, enable: bool) -> AppResult<()> {
    let map_err = |e: std::io::Error| AppError::Registry(e.to_string());
    let (key, _) = root.create_subkey(approved_path).map_err(map_err)?;

    let mut bytes = key
        .get_raw_value(name)
        .ok()
        .map(|v| v.bytes)
        .filter(|b| b.len() >= 12)
        .unwrap_or_else(|| vec![0u8; 12]);

    if enable {
        bytes[0] = (bytes[0] & !1) | 2;
        bytes[4..12].fill(0);
    } else {
        bytes[0] |= 3;
        bytes[4..12].copy_from_slice(&now_filetime().to_le_bytes());
    }

    key.set_raw_value(
        name,
        &RegValue {
            vtype: REG_BINARY,
            bytes,
        },
    )
    .map_err(map_err)
}

/// Current time as a Windows FILETIME (100 ns ticks since 1601-01-01).
fn now_filetime() -> u64 {
    const UNIX_EPOCH_IN_FILETIME: u64 = 116_444_736_000_000_000;
    let since_epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    UNIX_EPOCH_IN_FILETIME
        + since_epoch.as_secs() * 10_000_000
        + since_epoch.subsec_nanos() as u64 / 100
}

#[tauri::command]
pub async fn list_startup_items() -> AppResult<Vec<StartupItem>> {
    blocking(move || {
        let mut items: Vec<StartupItem> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();

        // Registry `Run` entries — present whether enabled or disabled; the
        // StartupApproved flag decides which.
        for (root_key, code, location, source) in [
            (HKEY_CURRENT_USER, "hr", "registry_hkcu_run", "Current user"),
            (HKEY_LOCAL_MACHINE, "mr", "registry_hklm_run", "All users"),
        ] {
            for (name, cmd) in run_values(RegKey::predef(root_key), RUN_PATH) {
                let id = format!("{code}::{name}");
                if !seen.insert(id.clone()) {
                    continue;
                }
                items.push(StartupItem {
                    id,
                    enabled: approval_enabled(RegKey::predef(root_key), APPROVED_RUN, &name),
                    name,
                    command: cmd,
                    location: location.into(),
                    source: source.into(),
                });
            }
        }

        // Legacy: entries an older version moved out of `Run` entirely. They
        // stay invisible to Task Manager until re-enabled here.
        for (root_key, backup, code, location, source) in [
            (HKEY_CURRENT_USER, BACKUP_HKCU, "hr", "registry_hkcu_run", "Current user"),
            (HKEY_LOCAL_MACHINE, BACKUP_HKLM, "mr", "registry_hklm_run", "All users"),
        ] {
            for (name, cmd) in run_values(RegKey::predef(root_key), backup) {
                let id = format!("{code}::{name}");
                if !seen.insert(id.clone()) {
                    continue;
                }
                items.push(StartupItem {
                    id,
                    name,
                    command: cmd,
                    location: location.into(),
                    enabled: false,
                    source: source.into(),
                });
            }
        }

        // Startup-folder shortcuts.
        collect_folder(
            &mut items,
            &mut seen,
            startup_folder_user(),
            HKEY_CURRENT_USER,
            "uf",
            "Startup folder (user)",
        );
        collect_folder(
            &mut items,
            &mut seen,
            startup_folder_common(),
            HKEY_LOCAL_MACHINE,
            "cf",
            "Startup folder (all users)",
        );

        items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(items)
    })
    .await
}

#[tauri::command]
pub async fn set_startup_enabled(
    app: tauri::AppHandle,
    id: String,
    enabled: bool,
) -> AppResult<()> {
    blocking(move || {
        let state = app.state::<AppState>();
        apply_raw(&id, enabled)?;
        let name = id
            .split_once("::")
            .map(|(_, n)| n)
            .unwrap_or(id.as_str())
            .to_string();
        state.record(
            "startup_toggle",
            format!(
                "{} startup item \u{201C}{name}\u{201D}",
                if enabled { "Enabled" } else { "Disabled" }
            ),
            serde_json::json!({ "id": id, "restore_enabled": !enabled }),
        );
        Ok(())
    })
    .await
}

/// Converts everything an older Tyverix version disabled by *removing* it into
/// a Windows-native "disabled" flag: the value goes back into `Run` (the
/// shortcut back into the Startup folder) and the StartupApproved bit is set.
///
/// Nothing the user chose changes — the entries stay disabled — but they stop
/// looking *missing* to their owner. That is what ends the boot-time noise:
/// Steam, Discord, Riot Client, FACEIT and friends re-create a `Run` value they
/// cannot find, and each re-creation makes Windows 11 announce a new startup
/// app and offer Task Manager's *Startup apps* page at the next sign-in.
///
/// Best-effort and idempotent: it runs at every launch and does nothing once
/// the legacy locations are empty. HKLM entries need elevation; if the user
/// declined the UAC prompt they are simply migrated on a later, elevated run.
pub fn migrate_legacy_disables() {
    for (root_key, backup_path) in [
        (HKEY_CURRENT_USER, BACKUP_HKCU),
        (HKEY_LOCAL_MACHINE, BACKUP_HKLM),
    ] {
        let Ok(backup) = RegKey::predef(root_key).open_subkey_with_flags(backup_path, KEY_ALL_ACCESS)
        else {
            continue;
        };
        for (name, value) in run_values(RegKey::predef(root_key), backup_path) {
            // If the owner already re-created its own value, keep that one.
            let exists = RegKey::predef(root_key)
                .open_subkey(RUN_PATH)
                .and_then(|k| k.get_value::<String, _>(&name))
                .is_ok();
            if !exists {
                let Ok((run, _)) = RegKey::predef(root_key).create_subkey(RUN_PATH) else {
                    continue;
                };
                if run.set_value(&name, &value).is_err() {
                    continue;
                }
            }
            if set_approval(RegKey::predef(root_key), APPROVED_RUN, &name, false).is_ok() {
                let _ = backup.delete_value(&name);
            }
        }
    }

    for (dir, approved_root) in [
        (startup_folder_user(), HKEY_CURRENT_USER),
        (startup_folder_common(), HKEY_LOCAL_MACHINE),
    ] {
        let Some(dir) = dir else { continue };
        let disabled_dir = dir.join(LEGACY_DISABLED_DIR);
        let Ok(entries) = std::fs::read_dir(&disabled_dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("lnk") {
                continue;
            }
            let Some(file) = path.file_name().and_then(|s| s.to_str()).map(str::to_string) else {
                continue;
            };
            let target = dir.join(&file);
            if !target.exists() && std::fs::rename(&path, &target).is_err() {
                continue;
            }
            let _ = set_approval(RegKey::predef(approved_root), APPROVED_FOLDER, &file, false);
        }
        // Only succeeds once every shortcut has been moved back out.
        let _ = std::fs::remove_dir(&disabled_dir);
    }
}

/// Re-applies the opposite of a recorded toggle. Used by the undo system; does
/// not itself create a new log entry.
pub fn apply_raw(id: &str, enabled: bool) -> AppResult<()> {
    let (code, name) = id
        .split_once("::")
        .ok_or_else(|| AppError::other("malformed startup id"))?;
    match code {
        "hr" => toggle_registry(HKEY_CURRENT_USER, BACKUP_HKCU, name, enabled),
        "mr" => toggle_registry(HKEY_LOCAL_MACHINE, BACKUP_HKLM, name, enabled),
        "uf" => toggle_folder(startup_folder_user(), HKEY_CURRENT_USER, name, enabled),
        "cf" => toggle_folder(startup_folder_common(), HKEY_LOCAL_MACHINE, name, enabled),
        _ => Err(AppError::other("unknown startup location")),
    }
}

fn toggle_registry(root_key: HKEY, backup_path: &str, name: &str, enable: bool) -> AppResult<()> {
    let map_err = |e: std::io::Error| AppError::Registry(e.to_string());
    let root = || RegKey::predef(root_key);

    if enable {
        // An older version may have moved the value out of `Run`; put it back
        // before clearing the flag, otherwise there is nothing to enable.
        if let Ok(backup) = root().open_subkey_with_flags(backup_path, KEY_ALL_ACCESS) {
            if let Ok(value) = backup.get_value::<String, _>(name) {
                let (run, _) = root().create_subkey(RUN_PATH).map_err(map_err)?;
                run.set_value(name, &value).map_err(map_err)?;
                let _ = backup.delete_value(name);
            }
        }
    }

    if root()
        .open_subkey(RUN_PATH)
        .and_then(|k| k.get_value::<String, _>(name))
        .is_err()
    {
        return Err(AppError::other(if enable {
            "no startup entry found to enable"
        } else {
            "startup entry no longer exists"
        }));
    }

    set_approval(root(), APPROVED_RUN, name, enable)
}

fn collect_folder(
    items: &mut Vec<StartupItem>,
    seen: &mut HashSet<String>,
    dir: Option<std::path::PathBuf>,
    approved_root: HKEY,
    code: &str,
    source: &str,
) {
    let Some(dir) = dir else { return };
    push_shortcuts(items, seen, &dir, Some(approved_root), code, source);
    // Legacy: shortcuts an older version moved aside are always disabled.
    push_shortcuts(items, seen, &dir.join(LEGACY_DISABLED_DIR), None, code, source);
}

fn push_shortcuts(
    items: &mut Vec<StartupItem>,
    seen: &mut HashSet<String>,
    dir: &std::path::Path,
    approved_root: Option<HKEY>,
    code: &str,
    source: &str,
) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("lnk") {
            continue;
        }
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let id = format!("{code}::{name}");
        if !seen.insert(id.clone()) {
            continue;
        }
        let enabled = match approved_root {
            Some(root) => approval_enabled(
                RegKey::predef(root),
                APPROVED_FOLDER,
                &format!("{name}.lnk"),
            ),
            None => false,
        };
        items.push(StartupItem {
            id,
            name,
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

fn toggle_folder(
    dir: Option<std::path::PathBuf>,
    approved_root: HKEY,
    name: &str,
    enable: bool,
) -> AppResult<()> {
    let dir = dir.ok_or_else(|| AppError::other("startup folder not found"))?;
    let file = format!("{name}.lnk");

    // Move a legacy "(disabled)" shortcut back before flipping the flag.
    let legacy = dir.join(LEGACY_DISABLED_DIR).join(&file);
    if enable && legacy.exists() {
        std::fs::create_dir_all(&dir)?;
        std::fs::rename(&legacy, dir.join(&file))?;
    }
    if !dir.join(&file).exists() {
        return Err(AppError::other("startup shortcut no longer exists"));
    }

    set_approval(RegKey::predef(approved_root), APPROVED_FOLDER, &file, enable)
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
