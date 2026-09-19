//! Performance tweaks: a catalogue of real, documented Windows settings that
//! can measurably affect frame rate, frame pacing or input latency.
//!
//! Three rules keep this module inside Tyverix's promise:
//!
//! 1. **Every tweak is a documented Windows mechanism.** No undocumented
//!    registry folklore, no service butchery, no `bcdedit` timer hacks.
//! 2. **Every tweak states its own honest expected impact**, including the
//!    ones whose impact is "probably none on your machine". A tweak the user
//!    should verify is labelled `situational`, and the A/B benchmark
//!    (`commands::bench`) exists precisely to settle the question with data.
//! 3. **Every tweak is reversible, and the exact previous value is written to
//!    disk before anything changes** (`%LOCALAPPDATA%\Tyverix\tweaks.json`), so
//!    a revert restores what was really there — even after a reboot or a
//!    crash. Where no previous value existed, the revert removes the value or
//!    restores Windows' documented default, and the UI says which.
//!
//! Nothing here touches anti-cheat-relevant surfaces: no driver signature
//! changes, no kernel patching, no memory writes into other processes, no
//! process hollowing. Every change is a registry value or a `powercfg` call
//! that the Windows UI itself can also make.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Manager;
use winreg::enums::*;
use winreg::RegKey;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::util::{app_data_dir, blocking, run_command};

// --- Catalogue model ---------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq)]
enum Hive {
    Hkcu,
    Hklm,
}

impl Hive {
    fn key(self) -> RegKey {
        RegKey::predef(match self {
            Hive::Hkcu => HKEY_CURRENT_USER,
            Hive::Hklm => HKEY_LOCAL_MACHINE,
        })
    }
    fn label(self) -> &'static str {
        match self {
            Hive::Hkcu => "HKCU",
            Hive::Hklm => "HKLM",
        }
    }
}

#[derive(Clone, PartialEq)]
enum Val {
    Dword(u32),
    Sz(&'static str),
}

/// One registry value a tweak owns: what it is set to when the tweak is on,
/// and what Windows' own default is (`None` = the value does not exist by
/// default, so reverting deletes it).
struct RegStep {
    hive: Hive,
    path: &'static str,
    name: &'static str,
    on: Val,
    default: Option<Val>,
}

/// One power setting a tweak owns, addressed by its `powercfg` subgroup and
/// setting GUID and applied to the *active* scheme only.
struct PowerStep {
    sub: &'static str,
    setting: &'static str,
    on: u32,
    default: u32,
}

enum Step {
    Reg(RegStep),
    Power(PowerStep),
    /// Turns off "fullscreen optimizations" for every detected game
    /// executable via `AppCompatFlags\Layers`. The exe set is dynamic, so the
    /// affected paths and their previous layer strings are recorded at apply
    /// time.
    FsoForGames,
    /// Disables Nagle's algorithm on every TCP interface that currently has an
    /// IP address. The interface GUIDs are dynamic, same as above.
    NagleOff,
}

/// How much this realistically changes, stated up front so the UI never
/// implies a number it cannot back up.
///
/// There is deliberately no "high" tier here. No registry value or power
/// setting reliably buys double-digit frame rate on a healthy system — the
/// changes that do are hardware and firmware ones, and those live in
/// `commands::diagnostics`, which can only report them. An optimizer claiming
/// otherwise is selling placebo.
#[derive(Clone, Copy)]
enum Impact {
    /// Usually measurable, typically in frame pacing rather than average FPS.
    Medium,
    /// Small and easily lost in run-to-run noise.
    Low,
    /// Can help a lot or nothing at all depending on hardware/game — measure.
    Situational,
}

impl Impact {
    fn as_str(self) -> &'static str {
        match self {
            Impact::Medium => "medium",
            Impact::Low => "low",
            Impact::Situational => "situational",
        }
    }
}

struct Spec {
    id: &'static str,
    name: &'static str,
    category: &'static str,
    description: &'static str,
    benefit: &'static str,
    downside: &'static str,
    impact: Impact,
    requires_restart: bool,
    requires_admin: bool,
    /// What reverting does, in plain words. Shown next to the "Reversible"
    /// badge so the promise is concrete rather than decorative.
    revert_note: &'static str,
    steps: Vec<Step>,
}

/// Serialized shape sent to the UI.
#[derive(Serialize)]
pub struct TweakInfo {
    pub id: String,
    pub name: String,
    pub category: String,
    pub description: String,
    pub benefit: String,
    pub downside: String,
    pub impact: String,
    pub applied: bool,
    pub available: bool,
    pub unavailable_reason: Option<String>,
    pub requires_restart: bool,
    pub requires_admin: bool,
    /// Always true in this module — nothing here is one-way. Kept explicit so
    /// the UI renders the same badge it renders for irreversible operations
    /// elsewhere (permanent file deletion in the cleaner, for example).
    pub reversible: bool,
    pub revert_note: String,
    /// Human-readable list of exactly what is written, for the "show me"
    /// disclosure in the UI and the published reference on the website.
    pub changes: Vec<String>,
    /// True once Tyverix holds a recorded previous value for this tweak, so a
    /// revert restores the real prior state rather than Windows' default.
    pub has_backup: bool,
}

// --- The catalogue -----------------------------------------------------------

const MULTIMEDIA_PROFILE: &str =
    r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile";
const MULTIMEDIA_GAMES: &str =
    r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games";

const SUB_PROCESSOR: &str = "54533251-82be-4824-96c1-47b60b740d00";
const CPMINCORES: &str = "0cc5b647-c1df-4637-891a-dec35c318583";
const SUB_USB: &str = "2a737441-1930-4402-8d77-b2bebba308a3";
const USB_SELECTIVE_SUSPEND: &str = "48e6b7a6-50f5-4782-a5d4-53bb8f07e226";

fn catalogue() -> Vec<Spec> {
    vec![
        // --- GPU & display ---------------------------------------------------
        Spec {
            id: "hags",
            name: "Hardware-accelerated GPU scheduling",
            category: "gpu",
            description:
                "Lets the GPU manage its own video memory and command scheduling instead of the Windows kernel driver.",
            benefit:
                "On some GPU/driver combinations it lowers frame latency and improves 1% lows. On others it does nothing, or slightly hurts.",
            downside:
                "This is genuinely a coin flip per machine — turn it on, run the A/B benchmark, and keep whichever setting measured better. Requires a restart to take effect.",
            impact: Impact::Situational,
            requires_restart: true,
            requires_admin: true,
            revert_note: "Writes HwSchMode back to its previous value (2 = on, 1 = off) and takes effect after a restart.",
            steps: vec![Step::Reg(RegStep {
                hive: Hive::Hklm,
                path: r"SYSTEM\CurrentControlSet\Control\GraphicsDrivers",
                name: "HwSchMode",
                on: Val::Dword(2),
                default: Some(Val::Dword(1)),
            })],
        },
        Spec {
            id: "mpo_off",
            name: "Disable Multi-Plane Overlay (MPO)",
            category: "gpu",
            description:
                "Stops the desktop compositor from handing frames to the display engine as hardware overlay planes.",
            benefit:
                "The documented fix for stutter, flicker and black flashes on multi-monitor and variable-refresh setups — a problem NVIDIA and Microsoft have both acknowledged. When it applies, frame pacing improves a lot.",
            downside:
                "Slightly higher GPU power draw when playing video in a window, because the compositor does the work instead of the display engine. No effect at all if you were not affected by the bug.",
            impact: Impact::Situational,
            requires_restart: true,
            requires_admin: true,
            revert_note: "Deletes OverlayTestMode (it does not exist on a stock Windows install) or restores the value that was there before.",
            steps: vec![Step::Reg(RegStep {
                hive: Hive::Hklm,
                path: r"SOFTWARE\Microsoft\Windows\Dwm",
                name: "OverlayTestMode",
                on: Val::Dword(5),
                default: None,
            })],
        },
        Spec {
            id: "fso_off",
            name: "Disable fullscreen optimizations for detected games",
            category: "gpu",
            description:
                "Marks each detected game executable so Windows runs it in true exclusive fullscreen instead of the composited borderless path.",
            benefit:
                "Removes one compositor hop between the game and the display. On DX11 titles this is a real input-latency and frame-pacing win; competitive shooters are the classic case.",
            downside:
                "Alt-tabbing becomes slower, and overlays that rely on composition (some Discord/Steam overlays, Windows' own Game Bar capture) may stop drawing. DX12 and Vulkan titles are largely unaffected either way.",
            impact: Impact::Medium,
            requires_restart: false,
            requires_admin: false,
            revert_note: "Restores each game's previous AppCompatFlags\\Layers string, or removes the entry entirely if there was none.",
            steps: vec![Step::FsoForGames],
        },
        Spec {
            id: "transparency_off",
            name: "Turn off window transparency effects",
            category: "gpu",
            description: "Disables the acrylic/blur effects the Windows shell draws behind menus, the taskbar and the Start menu.",
            benefit:
                "Frees a continuous slice of GPU work that runs even while a game is in the foreground. Noticeable on integrated graphics and entry-level GPUs.",
            downside: "Windows looks flatter. No effect on a mid-range or better discrete GPU.",
            impact: Impact::Low,
            requires_restart: false,
            requires_admin: false,
            revert_note: "Writes EnableTransparency back to its previous value (1 by default).",
            steps: vec![Step::Reg(RegStep {
                hive: Hive::Hkcu,
                path: r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
                name: "EnableTransparency",
                on: Val::Dword(0),
                default: Some(Val::Dword(1)),
            })],
        },
        Spec {
            id: "visual_effects_perf",
            name: "Visual effects: adjust for best performance",
            category: "gpu",
            description:
                "Sets the same system performance option as System Properties → Advanced → Performance → Adjust for best performance.",
            benefit: "Removes window animations and shadows that cost GPU time during alt-tab and while the shell is visible.",
            downside: "Purely cosmetic loss. Does nothing while a game already owns the whole screen.",
            impact: Impact::Low,
            requires_restart: false,
            requires_admin: false,
            revert_note: "Writes VisualFXSetting back to its previous value (0 = let Windows choose).",
            steps: vec![Step::Reg(RegStep {
                hive: Hive::Hkcu,
                path: r"Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects",
                name: "VisualFXSetting",
                on: Val::Dword(2),
                default: Some(Val::Dword(0)),
            })],
        },
        // --- Scheduling ------------------------------------------------------
        Spec {
            id: "mmcss_games",
            name: "Raise the multimedia scheduler's Games profile",
            category: "system",
            description:
                "Raises the thread priority and I/O priority Windows' Multimedia Class Scheduler grants to processes that register as games.",
            benefit:
                "Games that use MMCSS (most DirectX titles do) get scheduled ahead of background work. Shows up in 1% lows rather than average FPS.",
            downside:
                "Background encoding or streaming from the same machine can get slightly less CPU while you play.",
            impact: Impact::Low,
            requires_restart: false,
            requires_admin: true,
            revert_note: "Restores Priority, Scheduling Category and SFIO Priority to their previous values (Windows defaults: 2, Medium, Normal).",
            steps: vec![
                Step::Reg(RegStep {
                    hive: Hive::Hklm,
                    path: MULTIMEDIA_GAMES,
                    name: "Priority",
                    on: Val::Dword(6),
                    default: Some(Val::Dword(2)),
                }),
                Step::Reg(RegStep {
                    hive: Hive::Hklm,
                    path: MULTIMEDIA_GAMES,
                    name: "Scheduling Category",
                    on: Val::Sz("High"),
                    default: Some(Val::Sz("Medium")),
                }),
                Step::Reg(RegStep {
                    hive: Hive::Hklm,
                    path: MULTIMEDIA_GAMES,
                    name: "SFIO Priority",
                    on: Val::Sz("High"),
                    default: Some(Val::Sz("Normal")),
                }),
            ],
        },
        Spec {
            id: "system_responsiveness",
            name: "Reduce the background CPU reservation",
            category: "system",
            description:
                "Lowers SystemResponsiveness from 20 to 10, halving the share of CPU time Windows reserves for background tasks while multimedia work is running.",
            benefit: "Leaves more CPU for the foreground game on busy systems.",
            downside:
                "Small by design, and easily lost in benchmark noise. Setting it to 0 (as many guides suggest) can starve audio threads, so Tyverix stops at 10.",
            impact: Impact::Low,
            requires_restart: false,
            requires_admin: true,
            revert_note: "Writes SystemResponsiveness back to its previous value (20 by default).",
            steps: vec![Step::Reg(RegStep {
                hive: Hive::Hklm,
                path: MULTIMEDIA_PROFILE,
                name: "SystemResponsiveness",
                on: Val::Dword(10),
                default: Some(Val::Dword(20)),
            })],
        },
        Spec {
            id: "power_throttling_off",
            name: "Disable CPU power throttling",
            category: "cpu",
            description:
                "Turns off the Windows power-throttling feature that parks background threads on efficiency cores at reduced clocks.",
            benefit:
                "On laptops and on hybrid Intel CPUs this stops game worker threads from being demoted to a throttled state. Real gains on mobile hardware.",
            downside: "Higher idle power draw and shorter battery life. Little to no effect on a desktop already running a High/Ultimate power plan.",
            impact: Impact::Medium,
            requires_restart: false,
            requires_admin: true,
            revert_note: "Writes PowerThrottlingOff back to its previous value, or deletes it if it did not exist.",
            steps: vec![Step::Reg(RegStep {
                hive: Hive::Hklm,
                path: r"SYSTEM\CurrentControlSet\Control\Power\PowerThrottling",
                name: "PowerThrottlingOff",
                on: Val::Dword(1),
                default: None,
            })],
        },
        Spec {
            id: "core_parking_off",
            name: "Disable CPU core parking",
            category: "cpu",
            description:
                "Sets the active power plan's minimum parked-core percentage to 100, so Windows keeps every core online.",
            benefit: "Removes the wake-up delay when a game suddenly spreads work across all cores.",
            downside:
                "Mostly redundant: the High and Ultimate Performance plans that Game Mode switches to already disable parking. Worth having only if you stay on Balanced.",
            impact: Impact::Low,
            requires_restart: false,
            requires_admin: true,
            revert_note: "Writes the previous minimum-cores percentage back to the active power plan (Windows default: 100 on High Performance, lower on Balanced).",
            steps: vec![Step::Power(PowerStep {
                sub: SUB_PROCESSOR,
                setting: CPMINCORES,
                on: 100,
                default: 100,
            })],
        },
        // --- Windows capture overhead ---------------------------------------
        Spec {
            id: "game_dvr_off",
            name: "Turn off Game DVR background recording",
            category: "system",
            description:
                "Disables the background capture hooks Xbox Game Bar installs into every game process.",
            benefit:
                "A documented, measurable source of CPU and GPU overhead in DirectX titles — one of the few Windows defaults that genuinely costs frames.",
            downside: "You lose Win+Alt+R background clip recording. Screenshots and the overlay itself still work.",
            impact: Impact::Medium,
            requires_restart: false,
            requires_admin: true,
            revert_note: "Restores GameDVR_Enabled, AppCaptureEnabled and the AllowGameDVR policy to their previous values.",
            steps: vec![
                Step::Reg(RegStep {
                    hive: Hive::Hkcu,
                    path: r"System\GameConfigStore",
                    name: "GameDVR_Enabled",
                    on: Val::Dword(0),
                    default: Some(Val::Dword(1)),
                }),
                Step::Reg(RegStep {
                    hive: Hive::Hkcu,
                    path: r"Software\Microsoft\Windows\CurrentVersion\GameDVR",
                    name: "AppCaptureEnabled",
                    on: Val::Dword(0),
                    default: Some(Val::Dword(1)),
                }),
                Step::Reg(RegStep {
                    hive: Hive::Hklm,
                    path: r"SOFTWARE\Policies\Microsoft\Windows\GameDVR",
                    name: "AllowGameDVR",
                    on: Val::Dword(0),
                    default: None,
                }),
            ],
        },
        Spec {
            id: "gamebar_off",
            name: "Stop Xbox Game Bar from opening",
            category: "system",
            description:
                "Stops the Game Bar overlay from launching on Win+G and from prompting when a game starts.",
            benefit: "Removes an overlay process and its input hook from the foreground game.",
            downside:
                "Win+G no longer opens the overlay. Windows' own Game Mode scheduler is a separate feature and is deliberately left on — it helps.",
            impact: Impact::Low,
            requires_restart: false,
            requires_admin: false,
            revert_note: "Restores ShowStartupPanel and UseNexusForGameBarEnabled to their previous values (1 by default).",
            steps: vec![
                Step::Reg(RegStep {
                    hive: Hive::Hkcu,
                    path: r"Software\Microsoft\GameBar",
                    name: "ShowStartupPanel",
                    on: Val::Dword(0),
                    default: Some(Val::Dword(1)),
                }),
                Step::Reg(RegStep {
                    hive: Hive::Hkcu,
                    path: r"Software\Microsoft\GameBar",
                    name: "UseNexusForGameBarEnabled",
                    on: Val::Dword(0),
                    default: Some(Val::Dword(1)),
                }),
            ],
        },
        // --- Input -----------------------------------------------------------
        Spec {
            id: "mouse_accel_off",
            name: "Turn off mouse acceleration",
            category: "input",
            description:
                "Disables \"enhance pointer precision\", so the cursor moves a fixed distance per counted mouse movement.",
            benefit:
                "Not an FPS change — an aim-consistency change. The same physical flick produces the same in-game turn every time, which is why every competitive guide starts here.",
            downside: "Desktop pointer movement feels different until you adapt. Games with raw input already bypass this setting.",
            impact: Impact::Medium,
            requires_restart: false,
            requires_admin: false,
            revert_note: "Restores MouseSpeed and both MouseThreshold values to their previous settings (1, 6, 10 by default).",
            steps: vec![
                Step::Reg(RegStep {
                    hive: Hive::Hkcu,
                    path: r"Control Panel\Mouse",
                    name: "MouseSpeed",
                    on: Val::Sz("0"),
                    default: Some(Val::Sz("1")),
                }),
                Step::Reg(RegStep {
                    hive: Hive::Hkcu,
                    path: r"Control Panel\Mouse",
                    name: "MouseThreshold1",
                    on: Val::Sz("0"),
                    default: Some(Val::Sz("6")),
                }),
                Step::Reg(RegStep {
                    hive: Hive::Hkcu,
                    path: r"Control Panel\Mouse",
                    name: "MouseThreshold2",
                    on: Val::Sz("0"),
                    default: Some(Val::Sz("10")),
                }),
            ],
        },
        Spec {
            id: "usb_suspend_off",
            name: "Disable USB selective suspend",
            category: "input",
            description: "Stops Windows from power-gating idle USB ports on the active power plan.",
            benefit:
                "Prevents the occasional dropped poll or brief input hitch when a mouse, keyboard or headset wakes from a suspended port.",
            downside: "Marginally higher idle power draw. No effect if your ports were never being suspended.",
            impact: Impact::Situational,
            requires_restart: false,
            requires_admin: true,
            revert_note: "Restores the active power plan's USB selective-suspend setting to its previous value (enabled by default).",
            steps: vec![Step::Power(PowerStep {
                sub: SUB_USB,
                setting: USB_SELECTIVE_SUSPEND,
                on: 0,
                default: 1,
            })],
        },
        // --- Network ---------------------------------------------------------
        Spec {
            id: "nagle_off",
            name: "Disable Nagle's algorithm",
            category: "network",
            description:
                "Stops Windows from batching small TCP packets together before sending them, on every network interface that currently has an IP address.",
            benefit:
                "Removes up to a few tens of milliseconds of send-side delay for the small, frequent packets online games produce. Latency, not frame rate.",
            downside:
                "Slightly more packet overhead on the wire. Games that use UDP (most modern shooters) are unaffected — this helps TCP-based traffic.",
            impact: Impact::Situational,
            requires_restart: false,
            requires_admin: true,
            revert_note: "Removes TcpAckFrequency and TCPNoDelay from each interface, or restores the previous values where they already existed.",
            steps: vec![Step::NagleOff],
        },
        Spec {
            id: "network_throttling_off",
            name: "Remove the network throttling cap",
            category: "network",
            description:
                "Disables the 10-packets-per-millisecond cap Windows applies to non-multimedia network traffic while multimedia work is running.",
            benefit: "Documented by Microsoft; helps when a game shares the connection with downloads or streaming.",
            downside: "Audio and video playback can stutter marginally more under extreme network load.",
            impact: Impact::Low,
            requires_restart: false,
            requires_admin: true,
            revert_note: "Writes NetworkThrottlingIndex back to its previous value (10 by default).",
            steps: vec![Step::Reg(RegStep {
                hive: Hive::Hklm,
                path: MULTIMEDIA_PROFILE,
                name: "NetworkThrottlingIndex",
                on: Val::Dword(0xffff_ffff),
                default: Some(Val::Dword(10)),
            })],
        },
    ]
}

// --- Backups -----------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, PartialEq)]
#[serde(untagged)]
enum BackupVal {
    Dword(u32),
    Sz(String),
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "kind")]
enum Backup {
    Reg {
        hive: String,
        path: String,
        name: String,
        previous: Option<BackupVal>,
    },
    Power {
        sub: String,
        setting: String,
        previous: Option<u32>,
    },
    Layers {
        exe: String,
        previous: Option<String>,
    },
    Nagle {
        interface_key: String,
        ack_previous: Option<u32>,
        nodelay_previous: Option<u32>,
    },
}

#[derive(Serialize, Deserialize, Default)]
struct BackupStore {
    #[serde(default)]
    entries: HashMap<String, Vec<Backup>>,
}

fn backup_path() -> AppResult<PathBuf> {
    Ok(app_data_dir()?.join("tweaks.json"))
}

fn load_backups() -> BackupStore {
    backup_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn save_backups(store: &BackupStore) -> AppResult<()> {
    let text = serde_json::to_string_pretty(store).map_err(|e| AppError::Parse(e.to_string()))?;
    std::fs::write(backup_path()?, text)?;
    Ok(())
}

// --- Registry helpers ---------------------------------------------------------

fn read_val(hive: Hive, path: &str, name: &str, want_string: bool) -> Option<BackupVal> {
    let key = hive.key().open_subkey(path).ok()?;
    if want_string {
        key.get_value::<String, _>(name).ok().map(BackupVal::Sz)
    } else {
        key.get_value::<u32, _>(name).ok().map(BackupVal::Dword)
    }
}

fn write_val(hive: Hive, path: &str, name: &str, value: &BackupVal) -> AppResult<()> {
    let map_err = |e: std::io::Error| AppError::Registry(format!("{} \\ {}: {}", hive.label(), path, e));
    let (key, _) = hive.key().create_subkey(path).map_err(map_err)?;
    match value {
        BackupVal::Dword(v) => key.set_value(name, v).map_err(map_err),
        BackupVal::Sz(v) => key.set_value(name, v).map_err(map_err),
    }
}

fn delete_val(hive: Hive, path: &str, name: &str) {
    if let Ok(key) = hive.key().open_subkey_with_flags(path, KEY_SET_VALUE) {
        let _ = key.delete_value(name);
    }
}

fn to_backup_val(v: &Val) -> BackupVal {
    match v {
        Val::Dword(d) => BackupVal::Dword(*d),
        Val::Sz(s) => BackupVal::Sz((*s).to_string()),
    }
}

fn matches(current: Option<&BackupVal>, want: &Val) -> bool {
    match (current, want) {
        (Some(BackupVal::Dword(a)), Val::Dword(b)) => a == b,
        (Some(BackupVal::Sz(a)), Val::Sz(b)) => a.eq_ignore_ascii_case(b),
        _ => false,
    }
}

// --- Power-plan helpers -------------------------------------------------------

const POWER_SCHEMES: &str = r"SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes";

/// Reads the active scheme's value for a power setting straight out of the
/// registry. `powercfg /query` would have to be parsed out of localized
/// console text; the registry holds the same number in every language.
fn read_power_setting(sub: &str, setting: &str) -> Option<u32> {
    let scheme = super::power::active_plan_guid().ok()?;
    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(format!("{POWER_SCHEMES}\\{scheme}\\{sub}\\{setting}"))
        .ok()?
        .get_value::<u32, _>("ACSettingIndex")
        .ok()
}

fn write_power_setting(sub: &str, setting: &str, value: u32) -> AppResult<()> {
    let v = value.to_string();
    run_command(
        "powercfg",
        &["/setacvalueindex", "scheme_current", sub, setting, &v],
    )?;
    run_command(
        "powercfg",
        &["/setdcvalueindex", "scheme_current", sub, setting, &v],
    )?;
    // Re-activating the scheme is what actually applies the new index.
    run_command("powercfg", &["/setactive", "scheme_current"])?;
    Ok(())
}

// --- Fullscreen-optimization helpers ------------------------------------------

const LAYERS_PATH: &str = r"Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers";
const FSO_FLAG: &str = "DISABLEDXMAXIMIZEDWINDOWEDMODE";

fn game_exes(app: &tauri::AppHandle) -> Vec<String> {
    let state = app.state::<AppState>();
    let mut paths: Vec<String> = super::power::detect_game_processes(&state)
        .into_iter()
        .filter_map(|g| g.exe_path)
        .collect();
    paths.sort();
    paths.dedup();
    paths
}

fn layers_value(exe: &str) -> Option<String> {
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(LAYERS_PATH)
        .ok()?
        .get_value::<String, _>(exe)
        .ok()
}

/// Adds the flag while preserving any other compatibility layers already set
/// for that executable — overwriting them would silently undo a user's own
/// compatibility settings.
fn add_fso_flag(existing: Option<&str>) -> String {
    let mut parts: Vec<String> = existing
        .unwrap_or("")
        .split_whitespace()
        .filter(|p| !p.is_empty() && *p != "~")
        .map(|p| p.to_string())
        .collect();
    if !parts.iter().any(|p| p.eq_ignore_ascii_case(FSO_FLAG)) {
        parts.push(FSO_FLAG.to_string());
    }
    format!("~ {}", parts.join(" "))
}

// --- Nagle helpers ------------------------------------------------------------

const TCPIP_INTERFACES: &str = r"SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces";

/// Interface subkeys that currently hold an IP address — the ones actually
/// carrying traffic. Configuring every stale adapter GUID would be noise.
fn active_interface_keys() -> Vec<String> {
    let Ok(root) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey(TCPIP_INTERFACES) else {
        return Vec::new();
    };
    root.enum_keys()
        .filter_map(|k| k.ok())
        .filter(|name| {
            let Ok(key) = root.open_subkey(name) else {
                return false;
            };
            let has_ip = |value: &str| {
                key.get_value::<Vec<String>, _>(value)
                    .map(|v| v.iter().any(|s| !s.is_empty() && s != "0.0.0.0"))
                    .unwrap_or(false)
                    || key
                        .get_value::<String, _>(value)
                        .map(|s| !s.is_empty() && s != "0.0.0.0")
                        .unwrap_or(false)
            };
            has_ip("DhcpIPAddress") || has_ip("IPAddress")
        })
        .collect()
}

// --- Public commands -----------------------------------------------------------

#[tauri::command]
pub async fn list_tweaks(app: tauri::AppHandle) -> AppResult<Vec<TweakInfo>> {
    blocking(move || {
        let store = load_backups();
        let exes = game_exes(&app);
        let interfaces = active_interface_keys();

        Ok(catalogue()
            .into_iter()
            .map(|spec| {
                let (available, unavailable_reason) = availability(&spec, &exes, &interfaces);
                TweakInfo {
                    applied: available && is_applied(&spec, &exes, &interfaces),
                    id: spec.id.to_string(),
                    name: spec.name.to_string(),
                    category: spec.category.to_string(),
                    description: spec.description.to_string(),
                    benefit: spec.benefit.to_string(),
                    downside: spec.downside.to_string(),
                    impact: spec.impact.as_str().to_string(),
                    available,
                    unavailable_reason,
                    requires_restart: spec.requires_restart,
                    requires_admin: spec.requires_admin,
                    reversible: true,
                    revert_note: spec.revert_note.to_string(),
                    changes: describe(&spec, &exes, &interfaces),
                    has_backup: store.entries.contains_key(spec.id),
                }
            })
            .collect())
    })
    .await
}

#[tauri::command]
pub async fn set_tweak(app: tauri::AppHandle, id: String, enable: bool) -> AppResult<TweakInfo> {
    blocking(move || {
        let spec = catalogue()
            .into_iter()
            .find(|s| s.id == id)
            .ok_or_else(|| AppError::other(format!("unknown tweak: {id}")))?;

        let exes = game_exes(&app);
        let interfaces = active_interface_keys();
        let (available, reason) = availability(&spec, &exes, &interfaces);
        if !available {
            return Err(AppError::other(
                reason.unwrap_or_else(|| "this tweak does not apply to your system".into()),
            ));
        }

        let mut store = load_backups();
        if enable {
            apply(&spec, &exes, &interfaces, &mut store)?;
        } else {
            revert(&spec, &mut store)?;
        }
        save_backups(&store)?;

        let state = app.state::<AppState>();
        state.record(
            "tweak",
            format!(
                "{} tweak \u{201C}{}\u{201D}",
                if enable { "Applied" } else { "Reverted" },
                spec.name
            ),
            serde_json::json!({ "id": spec.id, "restore_enable": !enable }),
        );

        let store = load_backups();
        let (available, unavailable_reason) = availability(&spec, &exes, &interfaces);
        Ok(TweakInfo {
            applied: is_applied(&spec, &exes, &interfaces),
            id: spec.id.to_string(),
            name: spec.name.to_string(),
            category: spec.category.to_string(),
            description: spec.description.to_string(),
            benefit: spec.benefit.to_string(),
            downside: spec.downside.to_string(),
            impact: spec.impact.as_str().to_string(),
            available,
            unavailable_reason,
            requires_restart: spec.requires_restart,
            requires_admin: spec.requires_admin,
            reversible: true,
            revert_note: spec.revert_note.to_string(),
            changes: describe(&spec, &exes, &interfaces),
            has_backup: store.entries.contains_key(spec.id),
        })
    })
    .await
}

/// Reverts every tweak Tyverix currently holds a backup for. Exposed as the
/// panic button the Safety page offers: one click puts every performance
/// setting back the way Tyverix found it.
#[tauri::command]
pub async fn revert_all_tweaks(app: tauri::AppHandle) -> AppResult<usize> {
    blocking(move || {
        let mut store = load_backups();
        let ids: Vec<String> = store.entries.keys().cloned().collect();
        let mut reverted = 0usize;
        for spec in catalogue() {
            if !ids.iter().any(|id| id == spec.id) {
                continue;
            }
            if revert(&spec, &mut store).is_ok() {
                reverted += 1;
            }
        }
        save_backups(&store)?;
        if reverted > 0 {
            let state = app.state::<AppState>();
            state.record(
                "tweak",
                format!("Reverted every applied tweak ({reverted})"),
                serde_json::json!({ "bulk": true }),
            );
        }
        Ok(reverted)
    })
    .await
}

/// Used by the undo system in `commands::safety`.
pub fn apply_raw(id: &str, enable: bool, app: &tauri::AppHandle) -> AppResult<()> {
    let spec = catalogue()
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(|| AppError::other(format!("unknown tweak: {id}")))?;
    let exes = game_exes(app);
    let interfaces = active_interface_keys();
    let mut store = load_backups();
    if enable {
        apply(&spec, &exes, &interfaces, &mut store)?;
    } else {
        revert(&spec, &mut store)?;
    }
    save_backups(&store)
}

// --- Apply / revert / inspect --------------------------------------------------

fn availability(spec: &Spec, exes: &[String], interfaces: &[String]) -> (bool, Option<String>) {
    for step in &spec.steps {
        match step {
            Step::FsoForGames if exes.is_empty() => {
                return (
                    false,
                    Some("No game is running — start the game you want this applied to, then refresh.".into()),
                );
            }
            Step::NagleOff if interfaces.is_empty() => {
                return (false, Some("No network interface with an IP address was found.".into()));
            }
            _ => {}
        }
    }
    (true, None)
}

fn is_applied(spec: &Spec, exes: &[String], interfaces: &[String]) -> bool {
    spec.steps.iter().all(|step| match step {
        Step::Reg(r) => {
            let want_string = matches!(r.on, Val::Sz(_));
            matches(read_val(r.hive, r.path, r.name, want_string).as_ref(), &r.on)
        }
        Step::Power(p) => read_power_setting(p.sub, p.setting) == Some(p.on),
        Step::FsoForGames => {
            !exes.is_empty()
                && exes.iter().all(|exe| {
                    layers_value(exe)
                        .map(|v| v.to_uppercase().contains(FSO_FLAG))
                        .unwrap_or(false)
                })
        }
        Step::NagleOff => {
            !interfaces.is_empty()
                && interfaces.iter().all(|iface| {
                    let path = format!("{TCPIP_INTERFACES}\\{iface}");
                    read_val(Hive::Hklm, &path, "TcpAckFrequency", false)
                        == Some(BackupVal::Dword(1))
                        && read_val(Hive::Hklm, &path, "TCPNoDelay", false)
                            == Some(BackupVal::Dword(1))
                })
        }
    })
}

/// Plain-language list of exactly what a tweak writes. Shown in the app's
/// "what does this change?" disclosure and mirrored on the website so the
/// claim "every change is documented" is literally true.
fn describe(spec: &Spec, exes: &[String], interfaces: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for step in &spec.steps {
        match step {
            Step::Reg(r) => out.push(format!(
                "{}\\{}\\{} = {}",
                r.hive.label(),
                r.path,
                r.name,
                match &r.on {
                    Val::Dword(d) => format!("{d} (DWORD)"),
                    Val::Sz(s) => format!("\"{s}\""),
                }
            )),
            Step::Power(p) => out.push(format!(
                "powercfg /setacvalueindex SCHEME_CURRENT {} {} {}",
                p.sub, p.setting, p.on
            )),
            Step::FsoForGames => {
                if exes.is_empty() {
                    out.push(format!(
                        "HKCU\\{LAYERS_PATH}\\<game.exe> += {FSO_FLAG}"
                    ));
                } else {
                    for exe in exes {
                        out.push(format!("HKCU\\{LAYERS_PATH}\\{exe} += {FSO_FLAG}"));
                    }
                }
            }
            Step::NagleOff => {
                out.push(format!(
                    "HKLM\\{TCPIP_INTERFACES}\\<interface>\\{{TcpAckFrequency,TCPNoDelay}} = 1  (× {})",
                    interfaces.len()
                ));
            }
        }
    }
    out
}

fn apply(
    spec: &Spec,
    exes: &[String],
    interfaces: &[String],
    store: &mut BackupStore,
) -> AppResult<()> {
    // Record the current state first. If anything below fails, the backup is
    // still on disk, so a revert can put the machine back.
    let mut backups: Vec<Backup> = Vec::new();

    for step in &spec.steps {
        match step {
            Step::Reg(r) => {
                let want_string = matches!(r.on, Val::Sz(_));
                backups.push(Backup::Reg {
                    hive: r.hive.label().to_string(),
                    path: r.path.to_string(),
                    name: r.name.to_string(),
                    previous: read_val(r.hive, r.path, r.name, want_string),
                });
            }
            Step::Power(p) => backups.push(Backup::Power {
                sub: p.sub.to_string(),
                setting: p.setting.to_string(),
                previous: read_power_setting(p.sub, p.setting),
            }),
            Step::FsoForGames => {
                for exe in exes {
                    backups.push(Backup::Layers {
                        exe: exe.clone(),
                        previous: layers_value(exe),
                    });
                }
            }
            Step::NagleOff => {
                for iface in interfaces {
                    let path = format!("{TCPIP_INTERFACES}\\{iface}");
                    backups.push(Backup::Nagle {
                        interface_key: iface.clone(),
                        ack_previous: match read_val(Hive::Hklm, &path, "TcpAckFrequency", false) {
                            Some(BackupVal::Dword(v)) => Some(v),
                            _ => None,
                        },
                        nodelay_previous: match read_val(Hive::Hklm, &path, "TCPNoDelay", false) {
                            Some(BackupVal::Dword(v)) => Some(v),
                            _ => None,
                        },
                    });
                }
            }
        }
    }

    // Merge rather than replace: applying `fso_off` again after a second game
    // launched must not forget the first game's original layer string.
    let entry = store.entries.entry(spec.id.to_string()).or_default();
    for b in backups {
        if !already_recorded(entry, &b) {
            entry.push(b);
        }
    }
    save_backups(store)?;

    for step in &spec.steps {
        match step {
            Step::Reg(r) => write_val(r.hive, r.path, r.name, &to_backup_val(&r.on))?,
            Step::Power(p) => write_power_setting(p.sub, p.setting, p.on)?,
            Step::FsoForGames => {
                for exe in exes {
                    let next = add_fso_flag(layers_value(exe).as_deref());
                    write_val(Hive::Hkcu, LAYERS_PATH, exe, &BackupVal::Sz(next))?;
                }
            }
            Step::NagleOff => {
                for iface in interfaces {
                    let path = format!("{TCPIP_INTERFACES}\\{iface}");
                    write_val(Hive::Hklm, &path, "TcpAckFrequency", &BackupVal::Dword(1))?;
                    write_val(Hive::Hklm, &path, "TCPNoDelay", &BackupVal::Dword(1))?;
                }
            }
        }
    }
    Ok(())
}

fn already_recorded(entry: &[Backup], candidate: &Backup) -> bool {
    entry.iter().any(|b| match (b, candidate) {
        (
            Backup::Reg { hive: h1, path: p1, name: n1, .. },
            Backup::Reg { hive: h2, path: p2, name: n2, .. },
        ) => h1 == h2 && p1 == p2 && n1 == n2,
        (
            Backup::Power { sub: s1, setting: g1, .. },
            Backup::Power { sub: s2, setting: g2, .. },
        ) => s1 == s2 && g1 == g2,
        (Backup::Layers { exe: e1, .. }, Backup::Layers { exe: e2, .. }) => e1 == e2,
        (
            Backup::Nagle { interface_key: i1, .. },
            Backup::Nagle { interface_key: i2, .. },
        ) => i1 == i2,
        _ => false,
    })
}

fn revert(spec: &Spec, store: &mut BackupStore) -> AppResult<()> {
    // Preferred path: put back exactly what was recorded before the change.
    if let Some(backups) = store.entries.remove(spec.id) {
        for b in backups {
            match b {
                Backup::Reg { hive, path, name, previous } => {
                    let hive = if hive == "HKLM" { Hive::Hklm } else { Hive::Hkcu };
                    match previous {
                        Some(v) => write_val(hive, &path, &name, &v)?,
                        None => delete_val(hive, &path, &name),
                    }
                }
                Backup::Power { sub, setting, previous } => {
                    let target = previous.unwrap_or_else(|| {
                        spec.steps
                            .iter()
                            .find_map(|s| match s {
                                Step::Power(p) if p.sub == sub && p.setting == setting => {
                                    Some(p.default)
                                }
                                _ => None,
                            })
                            .unwrap_or(0)
                    });
                    write_power_setting(&sub, &setting, target)?;
                }
                Backup::Layers { exe, previous } => match previous {
                    Some(v) => write_val(Hive::Hkcu, LAYERS_PATH, &exe, &BackupVal::Sz(v))?,
                    None => delete_val(Hive::Hkcu, LAYERS_PATH, &exe),
                },
                Backup::Nagle { interface_key, ack_previous, nodelay_previous } => {
                    let path = format!("{TCPIP_INTERFACES}\\{interface_key}");
                    match ack_previous {
                        Some(v) => write_val(Hive::Hklm, &path, "TcpAckFrequency", &BackupVal::Dword(v))?,
                        None => delete_val(Hive::Hklm, &path, "TcpAckFrequency"),
                    }
                    match nodelay_previous {
                        Some(v) => write_val(Hive::Hklm, &path, "TCPNoDelay", &BackupVal::Dword(v))?,
                        None => delete_val(Hive::Hklm, &path, "TCPNoDelay"),
                    }
                }
            }
        }
        return Ok(());
    }

    // Fallback: the tweak was applied outside Tyverix (or the backup file was
    // deleted). Restore Windows' documented default instead, which the UI
    // announces through `has_backup: false`.
    for step in &spec.steps {
        match step {
            Step::Reg(r) => match &r.default {
                Some(v) => write_val(r.hive, r.path, r.name, &to_backup_val(v))?,
                None => delete_val(r.hive, r.path, r.name),
            },
            Step::Power(p) => write_power_setting(p.sub, p.setting, p.default)?,
            Step::FsoForGames => {
                let Ok(key) = RegKey::predef(HKEY_CURRENT_USER).open_subkey(LAYERS_PATH) else {
                    continue;
                };
                let names: Vec<String> = key
                    .enum_values()
                    .filter_map(|v| v.ok())
                    .map(|(n, _)| n)
                    .collect();
                for name in names {
                    let Some(current) = layers_value(&name) else { continue };
                    if !current.to_uppercase().contains(FSO_FLAG) {
                        continue;
                    }
                    let rest: Vec<String> = current
                        .split_whitespace()
                        .filter(|p| *p != "~" && !p.eq_ignore_ascii_case(FSO_FLAG))
                        .map(|p| p.to_string())
                        .collect();
                    if rest.is_empty() {
                        delete_val(Hive::Hkcu, LAYERS_PATH, &name);
                    } else {
                        write_val(
                            Hive::Hkcu,
                            LAYERS_PATH,
                            &name,
                            &BackupVal::Sz(format!("~ {}", rest.join(" "))),
                        )?;
                    }
                }
            }
            Step::NagleOff => {
                for iface in active_interface_keys() {
                    let path = format!("{TCPIP_INTERFACES}\\{iface}");
                    delete_val(Hive::Hklm, &path, "TcpAckFrequency");
                    delete_val(Hive::Hklm, &path, "TCPNoDelay");
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Overwriting a user's other compatibility layers would silently undo
    /// settings they made themselves, so the flag is merged, never assigned.
    #[test]
    fn fso_flag_preserves_existing_layers() {
        assert_eq!(add_fso_flag(None), "~ DISABLEDXMAXIMIZEDWINDOWEDMODE");
        assert_eq!(
            add_fso_flag(Some("~ RUNASADMIN")),
            "~ RUNASADMIN DISABLEDXMAXIMIZEDWINDOWEDMODE"
        );
        // Applying twice must not duplicate the flag.
        let once = add_fso_flag(Some("~ HIGHDPIAWARE"));
        assert_eq!(add_fso_flag(Some(&once)), once);
    }

    #[test]
    fn catalogue_ids_are_unique_and_every_tweak_is_described() {
        let specs = catalogue();
        let mut ids: Vec<&str> = specs.iter().map(|s| s.id).collect();
        ids.sort_unstable();
        let count = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), count, "duplicate tweak id in the catalogue");

        for s in &specs {
            assert!(!s.steps.is_empty(), "{} has no steps", s.id);
            assert!(!s.benefit.is_empty(), "{} has no benefit text", s.id);
            assert!(!s.downside.is_empty(), "{} has no downside text", s.id);
            assert!(
                !s.revert_note.is_empty(),
                "{} does not say what reverting does",
                s.id
            );
        }
    }

    /// Every registry step must declare what reverting restores — either the
    /// documented Windows default or "the value should not exist". Without it
    /// the fallback revert path has nothing to write.
    #[test]
    fn every_registry_step_declares_its_windows_default() {
        for s in catalogue() {
            for step in &s.steps {
                if let Step::Reg(r) = step {
                    // `None` is a legitimate default (value absent by default),
                    // but the type must match when one is given.
                    if let Some(d) = &r.default {
                        assert_eq!(
                            std::mem::discriminant(d),
                            std::mem::discriminant(&r.on),
                            "{}: default and on-value have different types for {}",
                            s.id,
                            r.name
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn matches_compares_by_value_and_type() {
        assert!(matches(Some(&BackupVal::Dword(2)), &Val::Dword(2)));
        assert!(!matches(Some(&BackupVal::Dword(1)), &Val::Dword(2)));
        assert!(matches(Some(&BackupVal::Sz("High".into())), &Val::Sz("high")));
        assert!(!matches(None, &Val::Dword(0)));
        // A DWORD is never equal to a string, even when they look alike.
        assert!(!matches(Some(&BackupVal::Sz("2".into())), &Val::Dword(2)));
    }
}
