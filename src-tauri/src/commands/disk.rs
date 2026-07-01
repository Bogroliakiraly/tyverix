//! Storage information: logical volumes (via sysinfo), physical-disk health
//! (via the Windows storage stack) and a large-file finder.

use std::path::Path;

use serde::{Deserialize, Serialize};
use sysinfo::Disks;

use crate::error::AppResult;
use crate::util::{blocking, parse_ps_array, run_powershell};

#[derive(Serialize)]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub file_system: String,
    pub total: u64,
    pub available: u64,
    pub removable: bool,
    pub kind: String,
}

#[tauri::command]
pub async fn list_disks() -> AppResult<Vec<DiskInfo>> {
    blocking(move || {
        let disks = Disks::new_with_refreshed_list();
        Ok(disks
            .iter()
            .map(|d| DiskInfo {
                name: d.name().to_string_lossy().to_string(),
                mount_point: d.mount_point().to_string_lossy().to_string(),
                file_system: d.file_system().to_string_lossy().to_string(),
                total: d.total_space(),
                available: d.available_space(),
                removable: d.is_removable(),
                kind: match d.kind() {
                    sysinfo::DiskKind::SSD => "SSD".into(),
                    sysinfo::DiskKind::HDD => "HDD".into(),
                    sysinfo::DiskKind::Unknown(_) => "Unknown".into(),
                },
            })
            .collect())
    })
    .await
}

#[derive(Serialize)]
pub struct PhysicalDiskHealth {
    pub friendly_name: String,
    pub media_type: String,
    pub health_status: String,
    pub size: u64,
    pub wear: Option<i64>,
    pub temperature: Option<i64>,
}

#[tauri::command]
pub async fn disk_health() -> AppResult<Vec<PhysicalDiskHealth>> {
    blocking(move || {
        // Get-PhysicalDisk reports health; reliability counters add wear/temp
        // when the drive exposes them (many consumer drives do not — hence
        // Option).
        let script = r#"
$ErrorActionPreference='SilentlyContinue'
$out = foreach ($d in Get-PhysicalDisk) {
  $rc = $d | Get-StorageReliabilityCounter
  [pscustomobject]@{
    FriendlyName = $d.FriendlyName
    MediaType    = "$($d.MediaType)"
    HealthStatus = "$($d.HealthStatus)"
    Size         = [int64]$d.Size
    Wear         = $rc.Wear
    Temperature  = $rc.Temperature
  }
}
$out | ConvertTo-Json -Depth 3
"#;

        #[derive(Deserialize)]
        struct Raw {
            #[serde(rename = "FriendlyName")]
            friendly_name: Option<String>,
            #[serde(rename = "MediaType")]
            media_type: Option<String>,
            #[serde(rename = "HealthStatus")]
            health_status: Option<String>,
            #[serde(rename = "Size")]
            size: Option<u64>,
            #[serde(rename = "Wear")]
            wear: Option<i64>,
            #[serde(rename = "Temperature")]
            temperature: Option<i64>,
        }

        let raw: Vec<Raw> = parse_ps_array(&run_powershell(script)?)?;
        Ok(raw
            .into_iter()
            .map(|r| PhysicalDiskHealth {
                friendly_name: r.friendly_name.unwrap_or_else(|| "Disk".into()),
                media_type: r.media_type.unwrap_or_else(|| "Unknown".into()),
                health_status: r.health_status.unwrap_or_else(|| "Unknown".into()),
                size: r.size.unwrap_or(0),
                wear: r.wear,
                temperature: r.temperature,
            })
            .collect())
    })
    .await
}

#[derive(Serialize)]
pub struct FileEntry {
    pub path: String,
    pub size: u64,
    pub modified: Option<String>,
}

#[tauri::command]
pub async fn find_large_files(root: String, min_bytes: u64) -> AppResult<Vec<FileEntry>> {
    blocking(move || {
        let mut found = Vec::new();
        walk(Path::new(&root), min_bytes, &mut found, 0);
        found.sort_by(|a, b| b.size.cmp(&a.size));
        found.truncate(200);
        Ok(found)
    })
    .await
}

fn walk(dir: &Path, min: u64, out: &mut Vec<FileEntry>, depth: usize) {
    // Bound recursion so a scan of a huge tree stays responsive.
    if depth > 12 || out.len() > 5000 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            walk(&path, min, out, depth + 1);
        } else if meta.is_file() && meta.len() >= min {
            out.push(FileEntry {
                path: path.to_string_lossy().to_string(),
                size: meta.len(),
                modified: meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| {
                        chrono::DateTime::<chrono::Utc>::from_timestamp(d.as_secs() as i64, 0)
                            .map(|dt| dt.to_rfc3339())
                            .unwrap_or_default()
                    }),
            });
        }
    }
}
