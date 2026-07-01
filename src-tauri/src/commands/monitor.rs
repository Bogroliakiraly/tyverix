//! Live system metrics and process management built on the `sysinfo` crate —
//! all values are read from the OS, never synthesised.

use serde::Serialize;
use sysinfo::{Pid, ProcessRefreshKind};
use tauri::Manager;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::util::blocking;

#[derive(Serialize)]
pub struct CpuInfo {
    pub brand: String,
    pub usage: f32,
    pub per_core: Vec<f32>,
    pub physical_cores: Option<usize>,
    pub logical_cores: usize,
    pub frequency_mhz: u64,
}

#[derive(Serialize)]
pub struct MemoryInfo {
    pub total: u64,
    pub used: u64,
    pub available: u64,
    pub swap_total: u64,
    pub swap_used: u64,
}

#[derive(Serialize)]
pub struct NetworkInfo {
    pub rx_per_sec: u64,
    pub tx_per_sec: u64,
    pub rx_total: u64,
    pub tx_total: u64,
}

#[derive(Serialize, Clone)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory: u64,
    pub exe: Option<String>,
}

#[derive(Serialize)]
pub struct SystemSnapshot {
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    pub network: NetworkInfo,
    pub uptime_secs: u64,
    pub process_count: usize,
    pub top_processes: Vec<ProcessInfo>,
}

#[tauri::command]
pub async fn get_system_snapshot(app: tauri::AppHandle) -> AppResult<SystemSnapshot> {
    blocking(move || {
        let state = app.state::<AppState>();
        let mut sys = state
            .sys
            .lock()
            .map_err(|_| AppError::other("system state is locked"))?;

        // Refresh only what we need to keep the call cheap.
        sys.refresh_cpu();
        sys.refresh_memory();
        sys.refresh_processes();

        let cpus = sys.cpus();
        let cpu = CpuInfo {
            brand: cpus
                .first()
                .map(|c| c.brand().trim().to_string())
                .unwrap_or_else(|| "Unknown CPU".into()),
            usage: sys.global_cpu_info().cpu_usage(),
            per_core: cpus.iter().map(|c| c.cpu_usage()).collect(),
            physical_cores: sys.physical_core_count(),
            logical_cores: cpus.len(),
            frequency_mhz: cpus.first().map(|c| c.frequency()).unwrap_or(0),
        };

        let memory = MemoryInfo {
            total: sys.total_memory(),
            used: sys.used_memory(),
            available: sys.available_memory(),
            swap_total: sys.total_swap(),
            swap_used: sys.used_swap(),
        };

        // Network deltas, normalised to per-second using the real elapsed time.
        let (rx_per_sec, tx_per_sec, rx_total, tx_total) = {
            let mut nets = state
                .networks
                .lock()
                .map_err(|_| AppError::other("network state is locked"))?;
            let mut last = state
                .last_net_refresh
                .lock()
                .map_err(|_| AppError::other("network timer is locked"))?;
            nets.refresh();
            let elapsed = last.elapsed().as_secs_f64().max(0.001);
            *last = std::time::Instant::now();

            let mut rx_delta = 0u64;
            let mut tx_delta = 0u64;
            let mut rx_tot = 0u64;
            let mut tx_tot = 0u64;
            for (_name, data) in nets.iter() {
                rx_delta += data.received();
                tx_delta += data.transmitted();
                rx_tot += data.total_received();
                tx_tot += data.total_transmitted();
            }
            (
                (rx_delta as f64 / elapsed) as u64,
                (tx_delta as f64 / elapsed) as u64,
                rx_tot,
                tx_tot,
            )
        };

        let mut top: Vec<ProcessInfo> = sys
            .processes()
            .values()
            .map(|p| ProcessInfo {
                pid: p.pid().as_u32(),
                name: p.name().to_string(),
                cpu_usage: p.cpu_usage(),
                memory: p.memory(),
                exe: p.exe().map(|e| e.to_string_lossy().to_string()),
            })
            .collect();

        let process_count = top.len();
        top.sort_by(|a, b| {
            b.cpu_usage
                .partial_cmp(&a.cpu_usage)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        top.truncate(12);

        Ok(SystemSnapshot {
            cpu,
            memory,
            network: NetworkInfo {
                rx_per_sec,
                tx_per_sec,
                rx_total,
                tx_total,
            },
            uptime_secs: sysinfo::System::uptime(),
            process_count,
            top_processes: top,
        })
    })
    .await
}

#[tauri::command]
pub async fn list_processes(app: tauri::AppHandle) -> AppResult<Vec<ProcessInfo>> {
    blocking(move || {
        let state = app.state::<AppState>();
        let mut sys = state
            .sys
            .lock()
            .map_err(|_| AppError::other("system state is locked"))?;
        sys.refresh_processes_specifics(ProcessRefreshKind::everything());

        let mut procs: Vec<ProcessInfo> = sys
            .processes()
            .values()
            .map(|p| ProcessInfo {
                pid: p.pid().as_u32(),
                name: p.name().to_string(),
                cpu_usage: p.cpu_usage(),
                memory: p.memory(),
                exe: p.exe().map(|e| e.to_string_lossy().to_string()),
            })
            .collect();
        procs.sort_by(|a, b| {
            b.cpu_usage
                .partial_cmp(&a.cpu_usage)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        Ok(procs)
    })
    .await
}

#[tauri::command]
pub async fn kill_process(app: tauri::AppHandle, pid: u32) -> AppResult<()> {
    blocking(move || {
        let state = app.state::<AppState>();
        let sys = state
            .sys
            .lock()
            .map_err(|_| AppError::other("system state is locked"))?;
        match sys.process(Pid::from_u32(pid)) {
            Some(p) => {
                if p.kill() {
                    Ok(())
                } else {
                    Err(AppError::other(
                        "the process could not be terminated (try running as administrator)",
                    ))
                }
            }
            None => Err(AppError::other("process no longer exists")),
        }
    })
    .await
}
