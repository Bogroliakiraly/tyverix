//! BoostForge backend entry point. Wires up shared state and registers every
//! Tauri command exposed to the React UI.

mod commands;
mod error;
mod state;
mod util;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Launched by the Task Scheduler entry created by `schedule::set_cleanup_schedule`.
    // Run the cleanup headlessly and exit — no window, no Tauri runtime needed.
    if std::env::args().any(|a| a == "--auto-clean") {
        commands::schedule::run_headless_auto_clean();
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            // Live monitoring
            commands::monitor::get_system_snapshot,
            commands::monitor::list_processes,
            commands::monitor::kill_process,
            // Cleaner
            commands::cleaner::scan_clean_targets,
            commands::cleaner::clean_targets,
            // Startup
            commands::startup::list_startup_items,
            commands::startup::set_startup_enabled,
            // Disk
            commands::disk::list_disks,
            commands::disk::disk_health,
            commands::disk::find_large_files,
            // Power & Game Mode
            commands::power::list_power_plans,
            commands::power::set_power_plan,
            commands::power::get_game_mode_status,
            commands::power::apply_game_mode,
            commands::power::restore_game_mode,
            // Safety
            commands::safety::create_restore_point,
            commands::safety::backup_registry,
            commands::safety::list_action_log,
            commands::safety::undo_action,
            // Memory reclamation
            commands::memory::free_memory,
            // Network latency (multiplayer)
            commands::network::measure_latency,
            // Scheduled cleanup
            commands::schedule::get_cleanup_schedule,
            commands::schedule::set_cleanup_schedule,
            commands::schedule::run_scheduled_cleanup_now,
            // Licensing / subscription
            commands::license::get_license_status,
            commands::license::activate_license,
            commands::license::deactivate_license,
            // System information
            commands::system_info::get_gpu_info,
            commands::system_info::get_windows_info,
            commands::system_info::list_drivers,
            commands::system_info::check_windows_updates,
            commands::system_info::list_installed_software,
            commands::system_info::list_services,
            commands::system_info::is_elevated,
        ])
        .run(tauri::generate_context!())
        .expect("error while running BoostForge");
}
