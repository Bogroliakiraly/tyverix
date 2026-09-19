//! Storage information: logical volumes (via sysinfo), physical-disk health
//! (via the Windows storage stack).

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

