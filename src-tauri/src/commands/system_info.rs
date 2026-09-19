//! Read-only system information: GPU, Windows build, drivers, pending updates,
//! installed software and services. These power the "Tools" tab.

use serde::{Deserialize, Serialize};
use winreg::enums::*;
use winreg::RegKey;

use crate::error::AppResult;
use crate::util::{blocking, parse_ps_array, run_powershell};

// --- GPU -------------------------------------------------------------------
#[derive(Serialize)]
pub struct GpuInfo {
    pub name: String,
    pub driver_version: Option<String>,
    pub driver_date: Option<String>,
    pub vram_total: Option<u64>,
    /// Real 3D-engine utilization from Windows' own performance counters —
    /// the same data source Task Manager's GPU graph uses. Works for any
    /// vendor without a proprietary SDK. `None` when the counter is
    /// unavailable (e.g. on some virtual machines) or when more than one GPU
    /// is present, since the counter does not reliably attribute usage to a
    /// specific adapter and we will not guess.
    pub utilization: Option<f32>,
}

#[tauri::command]
pub async fn get_gpu_info() -> AppResult<Vec<GpuInfo>> {
    blocking(move || {
        let script = r#"
Get-CimInstance Win32_VideoController | ForEach-Object {
  [pscustomobject]@{
    Name = $_.Name
    DriverVersion = $_.DriverVersion
    DriverDate = if ($_.DriverDate) { $_.DriverDate.ToString('yyyy-MM-dd') } else { $null }
    AdapterRAM = [int64]$_.AdapterRAM
  }
} | ConvertTo-Json -Depth 2
"#;

        #[derive(Deserialize)]
        struct Raw {
            #[serde(rename = "Name")]
            name: Option<String>,
            #[serde(rename = "DriverVersion")]
            driver_version: Option<String>,
            #[serde(rename = "DriverDate")]
            driver_date: Option<String>,
            #[serde(rename = "AdapterRAM")]
            adapter_ram: Option<i64>,
        }

        let raw: Vec<Raw> = parse_ps_array(&run_powershell(script)?)?;
        let mut gpus: Vec<GpuInfo> = raw
            .into_iter()
            .map(|r| GpuInfo {
                name: r.name.unwrap_or_else(|| "Unknown GPU".into()),
                driver_version: r.driver_version,
                driver_date: r.driver_date,
                // Win32_VideoController.AdapterRAM is a signed 32-bit value and
                // saturates at ~4 GB, so treat that ceiling as "unknown".
                vram_total: r.adapter_ram.and_then(|v| {
                    if v > 0 && v < 4_290_000_000 {
                        Some(v as u64)
                    } else {
                        None
                    }
                }),
                utilization: None,
            })
            .collect();

        // Only attribute the counter to a GPU when exactly one is present —
        // with multiple adapters we cannot reliably tell which one it measured.
        if gpus.len() == 1 {
            if let Some(pct) = read_gpu_3d_utilization() {
                gpus[0].utilization = Some(pct);
            }
        }

        Ok(gpus)
    })
    .await
}

/// Reads total "3D engine" utilization across all processes/adapters from
/// Windows' GPU performance counters — the same source Task Manager's GPU
/// graph uses. Real and measured, not vendor-specific, not invented.
fn read_gpu_3d_utilization() -> Option<f32> {
    let script = r#"
$ErrorActionPreference = 'Stop'
$samples = (Get-Counter '\GPU Engine(*engtype_3D)\Utilization Percentage').CounterSamples
$total = ($samples | Measure-Object -Property CookedValue -Sum).Sum
[math]::Round([math]::Min(100, $total), 1)
"#;
    run_powershell(script)
        .ok()
        .and_then(|out| out.trim().parse::<f32>().ok())
}

// --- Device identity ---------------------------------------------------------
/// A stable per-Windows-installation identifier (the OS's own `MachineGuid`,
/// generated once by Windows setup). Used only to keep the free trial and
/// account-sharing checks honest — e.g. so the same PC can't mint a fresh
/// 1-day trial by registering a new email each time. It never leaves the
/// device except as this opaque GUID sent to the vendor's own backend.
#[tauri::command]
pub async fn get_device_id() -> AppResult<String> {
    blocking(move || {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let key = hklm
            .open_subkey(r"SOFTWARE\Microsoft\Cryptography")
            .map_err(|e| crate::error::AppError::Registry(e.to_string()))?;
        let guid: String = key
            .get_value("MachineGuid")
            .map_err(|e| crate::error::AppError::Registry(e.to_string()))?;
        Ok(guid)
    })
    .await
}

// --- Elevation -------------------------------------------------------------
#[tauri::command]
pub async fn is_elevated() -> AppResult<bool> {
    blocking(move || {
        let script = r#"([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"#;
        let out = run_powershell(script)?;
        Ok(out.trim().eq_ignore_ascii_case("true"))
    })
    .await
}
