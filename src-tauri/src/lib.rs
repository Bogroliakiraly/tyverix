//! Tyverix backend entry point. Wires up shared state and registers every
//! Tauri command exposed to the React UI.

mod commands;
mod error;
mod state;
mod util;

use state::AppState;
use tauri::Manager;

/// True when the current process token is elevated (running as administrator).
#[cfg(windows)]
fn is_process_elevated() -> bool {
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
    use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
    unsafe {
        let mut token = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION::default();
        let mut size = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            Some(&mut elevation as *mut _ as *mut core::ffi::c_void),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut size,
        )
        .is_ok();
        let _ = CloseHandle(token);
        ok && elevation.TokenIsElevated != 0
    }
}

/// Relaunches this executable elevated via the UAC "runas" verb. Returns true if
/// the elevated process was started (so the caller should exit), false if the
/// user declined the prompt or it failed (caller keeps running unelevated).
#[cfg(windows)]
fn relaunch_as_admin() -> bool {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_NORMAL;

    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    let exe_w: Vec<u16> = exe.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let verb_w: Vec<u16> = "runas".encode_utf16().chain(std::iter::once(0)).collect();
    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(verb_w.as_ptr()),
            PCWSTR(exe_w.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_NORMAL,
        )
    };
    // ShellExecuteW returns a value > 32 on success.
    result.0 as isize > 32
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Launched by the Task Scheduler entry created by `schedule::set_cleanup_schedule`.
    // Run the cleanup headlessly and exit — no window, no Tauri runtime needed.
    if std::env::args().any(|a| a == "--auto-clean") {
        commands::schedule::run_headless_auto_clean();
        return;
    }

    // Tyverix performs admin-only operations (power plans, standby purge,
    // restore points). Always run elevated: if we're not, relaunch via UAC and
    // hand off to the elevated instance. If the user declines, fall through and
    // run unelevated (the UI clearly shows "Not running as administrator").
    // TYVERIX_NO_ELEVATE=1 skips the prompt entirely — used for automated
    // testing, where an elevated process could not be driven or debugged.
    #[cfg(windows)]
    {
        if std::env::var("TYVERIX_NO_ELEVATE").is_err()
            && !is_process_elevated()
            && relaunch_as_admin()
        {
            return;
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            // When Windows starts the app automatically, it should sit quietly
            // in the tray instead of opening a window over the user's desktop.
            Some(vec!["--minimized"]),
        ))
        .setup(|app| {
            setup_tray(app.handle())?;
            if std::env::args().any(|a| a == "--minimized") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            Ok(())
        })
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
            // Real FPS measurement (PresentMon)
            commands::fps::list_fps_targets,
            commands::fps::start_fps_measure,
            commands::fps::stop_fps_measure,
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
            commands::system_info::get_device_id,
            commands::stats::get_daily_stats,
        ])
        .build(tauri::generate_context!())
        .expect("error while running Tyverix")
        .run(|app, event| {
            // Honors the Game Mode card's "everything restores on close"
            // promise for every exit path, including Quit from the tray menu.
            if let tauri::RunEvent::Exit = event {
                commands::fps::stop_session();
                let state = app.state::<AppState>();
                let _ = commands::power::restore_game_mode_impl(&state);
            }
        });
}

/// Creates the always-present tray icon: left-click shows the window, the
/// menu offers Open and a real Quit (closing the window only hides to tray).
fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let open = MenuItem::with_id(app, "open", "Open Tyverix", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Tyverix")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}
