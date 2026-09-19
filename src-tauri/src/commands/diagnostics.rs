//! Hardware and configuration diagnostics — the read-only half of Tyverix's
//! performance story, and usually the more valuable half.
//!
//! Nothing in this module changes anything. It looks for the handful of
//! conditions that cost a gaming PC far more frames than any registry tweak
//! ever will, and that almost nobody checks: memory running below its rated
//! speed because XMP/EXPO was never enabled, a 165 Hz monitor quietly running
//! at 60 Hz, a GPU negotiated down to a x4 PCIe link, a card that is thermally
//! throttling, a game installed on a mechanical drive.
//!
//! Every finding reports what was actually measured. When a value genuinely
//! cannot be read on this machine — no NVIDIA tooling present, a vendor that
//! does not expose the counter — the finding says "not available" instead of
//! guessing, exactly as the GPU load readout elsewhere in the app does.

use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::util::{blocking, parse_ps_array, run_command, run_powershell};

/// One thing worth knowing about this machine's gaming performance.
#[derive(Serialize, Clone)]
pub struct Finding {
    pub id: String,
    pub title: String,
    /// What was found, in plain language.
    pub detail: String,
    /// "critical" | "warning" | "ok" | "info" | "unknown"
    pub severity: String,
    /// Honest expectation of what fixing this is worth.
    pub impact: String,
    /// What to do about it. Empty when there is nothing to do.
    pub fix: String,
    pub category: String,
    /// The raw measurement behind the verdict, so the user can check our work.
    pub measured: Option<String>,
    /// When the fix is a tweak Tyverix can apply, its id — the UI turns this
    /// into a button that jumps straight to it.
    pub fix_tweak_id: Option<String>,
    /// True when fixing this requires the BIOS/UEFI or a hardware change, so
    /// the UI never implies Tyverix can do it for you.
    pub requires_bios: bool,
}

impl Finding {
    fn new(id: &str, title: &str, category: &str, severity: &str) -> Self {
        Finding {
            id: id.into(),
            title: title.into(),
            detail: String::new(),
            severity: severity.into(),
            impact: String::new(),
            fix: String::new(),
            category: category.into(),
            measured: None,
            fix_tweak_id: None,
            requires_bios: false,
        }
    }
    fn detail(mut self, v: impl Into<String>) -> Self {
        self.detail = v.into();
        self
    }
    fn impact(mut self, v: impl Into<String>) -> Self {
        self.impact = v.into();
        self
    }
    fn fix(mut self, v: impl Into<String>) -> Self {
        self.fix = v.into();
        self
    }
    fn measured(mut self, v: impl Into<String>) -> Self {
        self.measured = Some(v.into());
        self
    }
    fn tweak(mut self, v: &str) -> Self {
        self.fix_tweak_id = Some(v.into());
        self
    }
    fn bios(mut self) -> Self {
        self.requires_bios = true;
        self
    }
}

#[tauri::command]
pub async fn run_diagnostics() -> AppResult<Vec<Finding>> {
    blocking(move || {
        let mut out = Vec::new();
        out.extend(check_memory());
        out.extend(check_display());
        out.extend(check_pcie_link());
        out.extend(check_nvidia());
        out.extend(check_power_plan());
        out.extend(check_pagefile());
        out.extend(check_storage());
        out.extend(check_windows_gaming_settings());
        out.extend(check_gpu_driver_age());

        // Problems first, then warnings, then everything that is already fine.
        let rank = |s: &str| match s {
            "critical" => 0,
            "warning" => 1,
            "info" => 2,
            "unknown" => 3,
            _ => 4,
        };
        out.sort_by_key(|f| rank(&f.severity));
        Ok(out)
    })
    .await
}

// --- Memory -------------------------------------------------------------------

#[derive(Deserialize)]
struct RamModule {
    #[serde(rename = "Capacity")]
    capacity: u64,
    #[serde(rename = "Speed")]
    speed: Option<u32>,
    #[serde(rename = "Configured")]
    configured: Option<u32>,
    #[serde(rename = "Locator")]
    locator: Option<String>,
}

/// XMP/EXPO left disabled is the single most common, most expensive and least
/// noticed misconfiguration on a gaming PC: DDR5 running at its 4800 MT/s JEDEC
/// fallback instead of the 6000 MT/s printed on the sticks costs 10-20% of the
/// 1% lows in CPU-bound games. WMI reports both numbers, so this is measurable,
/// not guesswork.
fn check_memory() -> Vec<Finding> {
    let script = r#"
Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
  [pscustomobject]@{
    Capacity   = [uint64]$_.Capacity
    Speed      = [uint32]$_.Speed
    Configured = [uint32]$_.ConfiguredClockSpeed
    Locator    = [string]$_.DeviceLocator
  }
} | ConvertTo-Json -Depth 2
"#;
    let Ok(raw) = run_powershell(script) else {
        return vec![Finding::new("ram_speed", "Memory speed", "memory", "unknown")
            .detail("Windows did not return memory module information on this machine.")
            .impact("Unknown — the check could not run.")];
    };
    let modules: Vec<RamModule> = match parse_ps_array(&raw) {
        Ok(m) => m,
        Err(_) => Vec::new(),
    };
    if modules.is_empty() {
        return vec![Finding::new("ram_speed", "Memory speed", "memory", "unknown")
            .detail("No memory modules were reported. Some OEM firmware hides this from Windows.")
            .impact("Unknown — the check could not run.")];
    }

    let mut out = Vec::new();

    // Rated vs configured speed.
    let rated = modules.iter().filter_map(|m| m.speed).max().unwrap_or(0);
    let configured = modules.iter().filter_map(|m| m.configured).max().unwrap_or(0);
    if rated > 0 && configured > 0 {
        let measured = format!("running {configured} MT/s, modules rated {rated} MT/s");
        if configured + 100 < rated {
            let pct = ((rated as f64 - configured as f64) / rated as f64 * 100.0).round();
            out.push(
                Finding::new("ram_speed", "Memory is running below its rated speed", "memory", "critical")
                    .detail(format!(
                        "Your modules are rated for {rated} MT/s but Windows reports them running at {configured} MT/s — {pct}% slower. This is what an unset XMP (Intel) or EXPO/DOCP (AMD) profile looks like."
                    ))
                    .impact("Typically 10-20% on 1% lows in CPU-bound games, and several percent on average FPS. The largest free gain available on most gaming PCs.")
                    .fix("Restart into the BIOS/UEFI and enable the XMP / EXPO / DOCP profile, then re-run this check. Tyverix cannot change firmware settings — and would not want to without you watching.")
                    .measured(measured)
                    .bios(),
            );
        } else {
            out.push(
                Finding::new("ram_speed", "Memory is running at its rated speed", "memory", "ok")
                    .detail(format!("Modules rated {rated} MT/s are running at {configured} MT/s."))
                    .impact("Nothing to gain here.")
                    .measured(measured),
            );
        }
    }

    // Channel population.
    let total_gb = modules.iter().map(|m| m.capacity).sum::<u64>() as f64 / 1_073_741_824.0;
    let locators: Vec<String> = modules
        .iter()
        .filter_map(|m| m.locator.clone())
        .map(|l| l.trim().to_string())
        .collect();
    let locator_text = if locators.is_empty() {
        "unknown slots".to_string()
    } else {
        locators.join(", ")
    };

    if modules.len() == 1 {
        out.push(
            Finding::new("ram_channels", "Memory is running single-channel", "memory", "critical")
                .detail(format!(
                    "Only one module is installed ({total_gb:.0} GB in {locator_text}), so the CPU can only use one memory channel."
                ))
                .impact("Large — commonly 20-30% of average FPS in CPU-bound and integrated-graphics scenarios. A second matching module is the cheapest real upgrade there is.")
                .fix("Add a second, matching module in the slot your motherboard manual pairs with this one (usually the second slot away from the CPU).")
                .measured(format!("1 module, {total_gb:.0} GB total"))
                .bios(),
        );
    } else {
        // Where the firmware labels channels, verify the sticks are actually
        // spread across them; two modules in the same channel behave like one.
        let channels: Vec<char> = locators
            .iter()
            .filter_map(|l| {
                let upper = l.to_uppercase();
                upper
                    .find("CHANNEL")
                    .and_then(|i| upper[i + 7..].trim_start().chars().next())
            })
            .collect();
        if channels.len() == modules.len() && channels.windows(2).all(|w| w[0] == w[1]) {
            out.push(
                Finding::new("ram_channels", "All memory modules are in the same channel", "memory", "warning")
                    .detail(format!(
                        "{} modules are installed, but all of them report the same memory channel ({locator_text}). That performs like single-channel.",
                        modules.len()
                    ))
                    .impact("Large — moving one module to the other channel typically recovers 15-25% in CPU-bound games.")
                    .fix("Consult your motherboard manual and move one module to the matching slot in the other channel.")
                    .measured(locator_text.clone())
                    .bios(),
            );
        } else {
            out.push(
                Finding::new("ram_channels", "Memory channel population looks correct", "memory", "ok")
                    .detail(format!(
                        "{} modules installed, {total_gb:.0} GB total ({locator_text}).",
                        modules.len()
                    ))
                    .impact("Nothing to gain here.")
                    .measured(format!("{} modules, {total_gb:.0} GB", modules.len())),
            );
        }
    }

    out
}

// --- Display ------------------------------------------------------------------

/// A monitor left at 60 Hz when it can do 144 or 165 is the single most
/// common "my new PC doesn't feel fast" cause. Read through the Win32 display
/// API rather than WMI, because `Win32_VideoController.MaxRefreshRate` reports
/// the adapter's limit, not the mode list the panel actually supports.
fn check_display() -> Vec<Finding> {
    #[cfg(windows)]
    {
        let displays = enumerate_displays();
        if displays.is_empty() {
            return vec![Finding::new("display_hz", "Display refresh rate", "display", "unknown")
                .detail("Windows did not return a display mode list.")
                .impact("Unknown — the check could not run.")];
        }
        return displays
            .into_iter()
            .enumerate()
            .map(|(i, d)| {
                let id = if i == 0 {
                    "display_hz".to_string()
                } else {
                    format!("display_hz_{i}")
                };
                let name = d.name.clone();
                let measured = format!(
                    "{}×{} @ {} Hz (panel supports up to {} Hz at this resolution)",
                    d.width, d.height, d.current_hz, d.max_hz
                );
                if d.max_hz > d.current_hz + 1 {
                    Finding::new(&id, "Display is not running at its highest refresh rate", "display", "critical")
                        .detail(format!(
                            "{name} is set to {} Hz but supports {} Hz at {}×{}.",
                            d.current_hz, d.max_hz, d.width, d.height
                        ))
                        .impact(format!(
                            "Every frame above {} FPS is currently being discarded. Raising this to {} Hz is the largest perceived-smoothness change available, and it costs nothing.",
                            d.current_hz, d.max_hz
                        ))
                        .fix("Settings → System → Display → Advanced display → Choose a refresh rate. If the higher rate is missing, check the cable (DisplayPort or HDMI 2.0+) and the monitor's own OSD.")
                        .measured(measured)
                } else {
                    Finding::new(&id, "Display is at its highest refresh rate", "display", "ok")
                        .detail(format!("{name} is running at {} Hz.", d.current_hz))
                        .impact("Nothing to gain here.")
                        .measured(measured)
                }
            })
            .collect();
    }
    #[cfg(not(windows))]
    Vec::new()
}

#[cfg(windows)]
struct DisplayMode {
    name: String,
    width: u32,
    height: u32,
    current_hz: u32,
    max_hz: u32,
}

#[cfg(windows)]
fn enumerate_displays() -> Vec<DisplayMode> {
    use windows::core::PCWSTR;
    use windows::Win32::Graphics::Gdi::{
        EnumDisplayDevicesW, EnumDisplaySettingsW, DEVMODEW, DISPLAY_DEVICEW,
        DISPLAY_DEVICE_ATTACHED_TO_DESKTOP, ENUM_CURRENT_SETTINGS, ENUM_DISPLAY_SETTINGS_MODE,
    };

    fn wide_to_string(buf: &[u16]) -> String {
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        String::from_utf16_lossy(&buf[..end])
    }

    let mut out = Vec::new();
    let mut index = 0u32;
    loop {
        let mut device = DISPLAY_DEVICEW {
            cb: std::mem::size_of::<DISPLAY_DEVICEW>() as u32,
            ..Default::default()
        };
        let ok = unsafe { EnumDisplayDevicesW(None, index, &mut device, 0) };
        index += 1;
        if !ok.as_bool() {
            break;
        }
        if (device.StateFlags & DISPLAY_DEVICE_ATTACHED_TO_DESKTOP).0 == 0 {
            continue;
        }

        let device_name: Vec<u16> = device.DeviceName.to_vec();
        let name_pcwstr = PCWSTR(device_name.as_ptr());

        let mut current = DEVMODEW {
            dmSize: std::mem::size_of::<DEVMODEW>() as u16,
            ..Default::default()
        };
        let got = unsafe { EnumDisplaySettingsW(name_pcwstr, ENUM_CURRENT_SETTINGS, &mut current) };
        if !got.as_bool() {
            continue;
        }

        // Highest refresh rate offered at the *current* resolution and colour
        // depth — comparing against a lower-resolution mode's rate would
        // produce a finding the user cannot act on.
        let mut max_hz = current.dmDisplayFrequency;
        let mut mode_index = 0u32;
        loop {
            let mut mode = DEVMODEW {
                dmSize: std::mem::size_of::<DEVMODEW>() as u16,
                ..Default::default()
            };
            let got = unsafe {
                EnumDisplaySettingsW(
                    name_pcwstr,
                    ENUM_DISPLAY_SETTINGS_MODE(mode_index),
                    &mut mode,
                )
            };
            if !got.as_bool() {
                break;
            }
            mode_index += 1;
            if mode.dmPelsWidth == current.dmPelsWidth
                && mode.dmPelsHeight == current.dmPelsHeight
                && mode.dmBitsPerPel == current.dmBitsPerPel
                && mode.dmDisplayFrequency > max_hz
            {
                max_hz = mode.dmDisplayFrequency;
            }
        }

        let friendly = wide_to_string(&device.DeviceString);
        let fallback = wide_to_string(&device.DeviceName);
        out.push(DisplayMode {
            name: if friendly.trim().is_empty() { fallback } else { friendly },
            width: current.dmPelsWidth,
            height: current.dmPelsHeight,
            current_hz: current.dmDisplayFrequency,
            max_hz,
        });
    }
    out
}

// --- PCIe link (vendor neutral) -------------------------------------------------

#[derive(Deserialize)]
struct PcieLink {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "CurSpeed")]
    cur_speed: Option<u32>,
    #[serde(rename = "CurWidth")]
    cur_width: Option<u32>,
    #[serde(rename = "MaxSpeed")]
    max_speed: Option<u32>,
    #[serde(rename = "MaxWidth")]
    max_width: Option<u32>,
}

/// Reads the negotiated PCIe link straight from Windows' PnP device
/// properties, so this works on NVIDIA, AMD and Intel alike — unlike the
/// vendor CLIs. `CurrentLinkSpeed` is the PCIe generation (1-5).
fn check_pcie_link() -> Vec<Finding> {
    let script = r#"
Get-PnpDevice -Class Display -Status OK -ErrorAction SilentlyContinue | ForEach-Object {
  $id = $_.InstanceId
  $p = { param($k) try { (Get-PnpDeviceProperty -InstanceId $id -KeyName $k -ErrorAction Stop).Data } catch { $null } }
  [pscustomobject]@{
    Name      = [string]$_.FriendlyName
    CurSpeed  = & $p 'DEVPKEY_PciDevice_CurrentLinkSpeed'
    CurWidth  = & $p 'DEVPKEY_PciDevice_CurrentLinkWidth'
    MaxSpeed  = & $p 'DEVPKEY_PciDevice_MaxLinkSpeed'
    MaxWidth  = & $p 'DEVPKEY_PciDevice_MaxLinkWidth'
  }
} | ConvertTo-Json -Depth 2
"#;
    let Ok(raw) = run_powershell(script) else {
        return Vec::new();
    };
    let links: Vec<PcieLink> = parse_ps_array(&raw).unwrap_or_default();

    links
        .into_iter()
        .filter_map(|l| {
            let (cur_s, cur_w, max_s, max_w) =
                (l.cur_speed?, l.cur_width?, l.max_speed?, l.max_width?);
            // Integrated graphics report no meaningful link.
            if max_w == 0 {
                return None;
            }
            let name = l.name;
            let measured = format!("Gen{cur_s} x{cur_w} (card supports Gen{max_s} x{max_w})");
            Some(if cur_w < max_w {
                Finding::new("pcie_width", "GPU is running on a narrowed PCIe link", "gpu", "warning")
                    .detail(format!(
                        "{name} is negotiated at x{cur_w} but the card supports x{max_w}. The usual causes are the card sitting in a secondary slot, an M.2 drive sharing the lanes, or a riser cable."
                    ))
                    .impact("x8 instead of x16 typically costs a few percent; x4 costs 10-25%, and much more in games that stream textures heavily.")
                    .fix("Move the card to the primary PCIe slot (the one closest to the CPU) and check whether an M.2 drive is sharing its lanes.")
                    .measured(measured)
            } else if cur_s < max_s {
                Finding::new("pcie_width", "GPU is linked at a lower PCIe generation", "gpu", "info")
                    .detail(format!(
                        "{name} is linked at Gen{cur_s} while the card supports Gen{max_s}. Idle cards drop their link speed on purpose, so re-run this while a game is loaded before drawing any conclusion."
                    ))
                    .impact("Usually none at idle. If it stays low under load, check the slot and the BIOS PCIe generation setting.")
                    .measured(measured)
            } else {
                Finding::new("pcie_width", "GPU PCIe link is at full speed and width", "gpu", "ok")
                    .detail(format!("{name} is linked at Gen{cur_s} x{cur_w}."))
                    .impact("Nothing to gain here.")
                    .measured(measured)
            })
        })
        .collect()
}

// --- NVIDIA extras (Resizable BAR, throttling) ----------------------------------

/// `nvidia-smi` ships with every NVIDIA driver and is the only consumer-facing
/// way to read the BAR1 aperture and the GPU's own throttle-reason flags. AMD
/// and Intel ship no equivalent, so on those cards this honestly reports "not
/// available" rather than inventing a verdict.
fn check_nvidia() -> Vec<Finding> {
    let query = run_command(
        "nvidia-smi",
        &[
            "--query-gpu=name,temperature.gpu,memory.total",
            "--format=csv,noheader,nounits",
        ],
    );

    let Ok(text) = query else {
        return vec![Finding::new(
            "gpu_vendor_metrics",
            "Resizable BAR and GPU throttling",
            "gpu",
            "unknown",
        )
        .detail("These two are read through NVIDIA's nvidia-smi, which is not installed on this machine. AMD and Intel ship no equivalent tool, so Tyverix cannot measure them here — and will not guess.")
        .impact("Unknown — the check could not run. Resizable BAR state is shown in AMD Software → Performance → Tuning, and in your BIOS as \"Re-Size BAR Support\".")];
    };

    let Some(line) = text.lines().find(|l| !l.trim().is_empty()) else {
        return Vec::new();
    };
    let cols: Vec<String> = line.split(',').map(|c| c.trim().to_string()).collect();
    let get = |i: usize| cols.get(i).cloned().unwrap_or_default();
    let num = |i: usize| get(i).parse::<u32>().ok();

    let name = get(0);
    let mut out = Vec::new();

    // Resizable BAR: without it the CPU sees a 256 MB aperture into VRAM;
    // with it, the aperture covers (nearly) the whole framebuffer.
    if let Some(bar1_mb) = nvidia_bar1_total_mb() {
        let vram_mb = num(2).unwrap_or(0);
        let measured = format!("BAR1 aperture {bar1_mb} MB, VRAM {vram_mb} MB");
        if bar1_mb <= 512 && vram_mb > 1024 {
            out.push(
                Finding::new("resizable_bar", "Resizable BAR is off", "gpu", "warning")
                    .detail(format!(
                        "{name} reports a {bar1_mb} MB BAR1 aperture against {vram_mb} MB of VRAM, which is the classic signature of Resizable BAR being disabled."
                    ))
                    .impact("Game-dependent: usually 2-8%, occasionally more in titles that stream heavily. Free if your board supports it.")
                    .fix("Enable \"Above 4G Decoding\" and \"Re-Size BAR Support\" in the BIOS/UEFI. Both are required; CSM must be off.")
                    .measured(measured)
                    .bios(),
            );
        } else {
            out.push(
                Finding::new("resizable_bar", "Resizable BAR is on", "gpu", "ok")
                    .detail(format!("{name} exposes a {bar1_mb} MB BAR1 aperture."))
                    .impact("Nothing to gain here.")
                    .measured(measured),
            );
        }
    }

    // Throttling — the GPU's own reason flags, not a temperature guess.
    let throttle = run_command(
        "nvidia-smi",
        &[
            "--query-gpu=clocks_throttle_reasons.hw_thermal_slowdown,clocks_throttle_reasons.sw_thermal_slowdown,clocks_throttle_reasons.hw_power_brake_slowdown",
            "--format=csv,noheader",
        ],
    );
    let temp = num(1);
    match throttle {
        Ok(t) => {
            let active = t.to_lowercase().contains("active");
            let temp_text = temp
                .map(|c| format!("{c} °C"))
                .unwrap_or_else(|| "temperature not reported".into());
            if active {
                out.push(
                    Finding::new("gpu_throttle", "GPU is throttling", "gpu", "critical")
                        .detail(format!(
                            "{name} is reporting an active thermal or power slowdown right now ({temp_text}). The card is lowering its own clocks, so no software setting can recover those frames."
                        ))
                        .impact("Large and ongoing. This is a cooling or power-limit problem, not a Windows problem.")
                        .fix("Clean the dust filters and fans, improve case airflow, and re-check the fan curve. Repasting is worth considering on cards older than about three years.")
                        .measured(format!("throttle flags active, {temp_text}")),
                );
            } else {
                out.push(
                    Finding::new("gpu_throttle", "GPU is not throttling", "gpu", "ok")
                        .detail(format!("{name} reports no thermal or power slowdown ({temp_text})."))
                        .impact("Nothing to gain here. Re-run this during a long gaming session for a harder test.")
                        .measured(temp_text),
                );
            }
        }
        Err(_) => {
            out.push(
                Finding::new("gpu_throttle", "GPU throttling state", "gpu", "unknown")
                    .detail("This driver version does not expose the throttle-reason counters.")
                    .impact("Unknown — the check could not run."),
            );
        }
    }

    out
}

/// Parses the BAR1 total out of `nvidia-smi -q -d MEMORY`, which prints it as
/// a "BAR1 Memory Usage" block. There is no `--query-gpu` field for it.
fn nvidia_bar1_total_mb() -> Option<u32> {
    let text = run_command("nvidia-smi", &["-q", "-d", "MEMORY"]).ok()?;
    let mut in_bar1 = false;
    for line in text.lines() {
        let lower = line.to_lowercase();
        if lower.contains("bar1 memory usage") {
            in_bar1 = true;
            continue;
        }
        if in_bar1 && lower.contains("total") {
            return line
                .split(':')
                .nth(1)?
                .split_whitespace()
                .next()?
                .parse::<u32>()
                .ok();
        }
    }
    None
}

// --- Power plan ----------------------------------------------------------------

fn check_power_plan() -> Vec<Finding> {
    let Ok(guid) = super::power::active_plan_guid() else {
        return Vec::new();
    };
    // Balanced is Windows' default; it down-clocks and parks cores.
    const BALANCED: &str = "381b4222-f694-41f0-9685-ff5bb260df2e";
    const POWER_SAVER: &str = "a1841308-3541-4fab-bc81-f71556f20b4a";

    if guid.eq_ignore_ascii_case(POWER_SAVER) {
        vec![
            Finding::new("power_plan", "Windows is on the Power saver plan", "cpu", "critical")
                .detail("Power saver caps CPU frequency and parks cores aggressively.")
                .impact("Very large in CPU-bound games — often tens of percent.")
                .fix("Switch to High performance on the Game Mode page, or let Game Mode do it for you.")
                .measured(guid),
        ]
    } else if guid.eq_ignore_ascii_case(BALANCED) {
        vec![
            Finding::new("power_plan", "Windows is on the Balanced power plan", "cpu", "warning")
                .detail("Balanced lets Windows park cores and drop clocks between frames.")
                .impact("Small on modern desktop CPUs, meaningful on laptops and older hardware. Game Mode switches this for you and switches it back when you turn it off.")
                .fix("Engage Game Mode, or pick High/Ultimate Performance on the Game Mode page.")
                .measured(guid),
        ]
    } else {
        vec![
            Finding::new("power_plan", "A performance power plan is active", "cpu", "ok")
                .detail("Windows is not parking cores or capping frequency through the power plan.")
                .impact("Nothing to gain here.")
                .measured(guid),
        ]
    }
}

// --- Pagefile -------------------------------------------------------------------

fn check_pagefile() -> Vec<Finding> {
    let script = r#"
$cs = Get-CimInstance Win32_ComputerSystem
$pf = @(Get-CimInstance Win32_PageFileUsage)
[pscustomobject]@{
  Automatic = [bool]$cs.AutomaticManagedPagefile
  Count     = $pf.Count
  TotalMB   = [uint32](($pf | Measure-Object -Property AllocatedBaseSize -Sum).Sum)
} | ConvertTo-Json
"#;
    #[derive(Deserialize)]
    struct Pf {
        #[serde(rename = "Automatic")]
        automatic: bool,
        #[serde(rename = "Count")]
        count: u32,
        #[serde(rename = "TotalMB")]
        total_mb: u32,
    }
    let Ok(raw) = run_powershell(script) else {
        return Vec::new();
    };
    let Ok(pf) = serde_json::from_str::<Pf>(raw.trim()) else {
        return Vec::new();
    };

    if pf.count == 0 || pf.total_mb == 0 {
        vec![
            Finding::new("pagefile", "The page file is disabled", "memory", "critical")
                .detail("Windows has no page file. Modern games reserve far more virtual address space than they commit, and several will crash or stutter badly without one — regardless of how much RAM is installed.")
                .impact("Not an FPS gain but a stability and stutter fix. \"Disable your pagefile for more FPS\" is one of the oldest pieces of bad advice on the internet.")
                .fix("System Properties → Advanced → Performance → Advanced → Virtual memory → let Windows manage it.")
                .measured("no page file")
        ]
    } else {
        vec![
            Finding::new("pagefile", "A page file is configured", "memory", "ok")
                .detail(format!(
                    "{} page file(s), {} MB total, {}.",
                    pf.count,
                    pf.total_mb,
                    if pf.automatic { "managed by Windows" } else { "manually sized" }
                ))
                .impact("Nothing to gain here.")
                .measured(format!("{} MB", pf.total_mb)),
        ]
    }
}

// --- Storage ---------------------------------------------------------------------

fn check_storage() -> Vec<Finding> {
    use sysinfo::Disks;
    let disks = Disks::new_with_refreshed_list();
    let mut out = Vec::new();

    // Free space on the system drive. Below ~10% both NTFS and SSD garbage
    // collection slow down measurably.
    if let Some(sys_disk) = disks.iter().find(|d| {
        d.mount_point()
            .to_string_lossy()
            .to_uppercase()
            .starts_with('C')
    }) {
        let total = sys_disk.total_space();
        let free = sys_disk.available_space();
        if total > 0 {
            let pct = free as f64 / total as f64 * 100.0;
            let measured = format!(
                "{:.0} GB free of {:.0} GB ({pct:.0}%)",
                free as f64 / 1e9,
                total as f64 / 1e9
            );
            if pct < 10.0 {
                out.push(
                    Finding::new("disk_free", "The system drive is nearly full", "storage", "warning")
                        .detail(format!("Only {pct:.0}% of the system drive is free."))
                        .impact("SSDs lose write performance below roughly 10% free, which shows up as loading stutter and shader-compilation hitches.")
                        .fix("Use the Cleaner page, and move a game or two to another drive.")
                        .measured(measured),
                );
            } else {
                out.push(
                    Finding::new("disk_free", "The system drive has healthy free space", "storage", "ok")
                        .detail(format!("{pct:.0}% of the system drive is free."))
                        .impact("Nothing to gain here.")
                        .measured(measured),
                );
            }
        }
    }

    // Mechanical drives present at all — the likely home of a stuttering game.
    let hdds: Vec<String> = disks
        .iter()
        .filter(|d| matches!(d.kind(), sysinfo::DiskKind::HDD))
        .map(|d| d.mount_point().to_string_lossy().to_string())
        .collect();
    if !hdds.is_empty() {
        out.push(
            Finding::new("game_storage", "A mechanical hard drive is installed", "storage", "info")
                .detail(format!(
                    "Mechanical drive(s) detected at {}. Games installed there load slower and can hitch while streaming assets mid-level.",
                    hdds.join(", ")
                ))
                .impact("Does not change average FPS, but it is one of the biggest causes of 1% low dips and traversal stutter in open-world games.")
                .fix("Move the games you play most onto an SSD.")
                .measured(hdds.join(", ")),
        );
    }

    out
}

// --- Windows gaming settings ------------------------------------------------------

fn check_windows_gaming_settings() -> Vec<Finding> {
    use winreg::enums::*;
    use winreg::RegKey;

    let mut out = Vec::new();
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    // Windows' own Game Mode is genuinely useful and should stay on. It is not
    // the same thing as Xbox Game Bar, which Tyverix does offer to switch off.
    let auto_game_mode: Option<u32> = hkcu
        .open_subkey(r"Software\Microsoft\GameBar")
        .ok()
        .and_then(|k| k.get_value("AutoGameModeEnabled").ok());
    if auto_game_mode == Some(0) {
        out.push(
            Finding::new("windows_game_mode", "Windows Game Mode is turned off", "system", "warning")
                .detail("Windows Game Mode keeps background work off the cores your game is using. It is one of the few Microsoft performance features that does what it says.")
                .impact("Small but consistent, mostly in 1% lows on machines with background activity.")
                .fix("Settings → Gaming → Game Mode → On.")
                .measured("AutoGameModeEnabled = 0"),
        );
    }

    // HAGS state, purely informational — the tweak page is where it is changed.
    let hags: Option<u32> = hklm
        .open_subkey(r"SYSTEM\CurrentControlSet\Control\GraphicsDrivers")
        .ok()
        .and_then(|k| k.get_value("HwSchMode").ok());
    match hags {
        Some(2) => out.push(
            Finding::new("hags_state", "Hardware-accelerated GPU scheduling is on", "gpu", "info")
                .detail("HAGS is enabled. Whether that helps is genuinely machine-specific.")
                .impact("Measure it: run the A/B benchmark, toggle HAGS, restart, and measure again.")
                .measured("HwSchMode = 2")
                .tweak("hags"),
        ),
        Some(_) | None => out.push(
            Finding::new("hags_state", "Hardware-accelerated GPU scheduling is off", "gpu", "info")
                .detail("HAGS is disabled. On some GPU and driver combinations enabling it lowers frame latency; on others it does nothing.")
                .impact("Measure it: run the A/B benchmark, toggle HAGS, restart, and measure again.")
                .measured("HwSchMode = 1 or unset")
                .tweak("hags"),
        ),
    }

    out
}

// --- GPU driver age ----------------------------------------------------------------

fn check_gpu_driver_age() -> Vec<Finding> {
    let script = r#"
Get-CimInstance Win32_VideoController | ForEach-Object {
  [pscustomobject]@{
    Name = [string]$_.Name
    Version = [string]$_.DriverVersion
    Date = if ($_.DriverDate) { $_.DriverDate.ToString('yyyy-MM-dd') } else { $null }
  }
} | ConvertTo-Json -Depth 2
"#;
    #[derive(Deserialize)]
    struct Gpu {
        #[serde(rename = "Name")]
        name: String,
        #[serde(rename = "Version")]
        version: String,
        #[serde(rename = "Date")]
        date: Option<String>,
    }
    let Ok(raw) = run_powershell(script) else {
        return Vec::new();
    };
    let gpus: Vec<Gpu> = parse_ps_array(&raw).unwrap_or_default();

    gpus.into_iter()
        .filter(|g| {
            let n = g.name.to_lowercase();
            n.contains("nvidia") || n.contains("radeon") || n.contains("amd") || n.contains("intel")
        })
        .filter_map(|g| {
            let date = g.date.clone()?;
            let parsed = chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d").ok()?;
            let months = (chrono::Utc::now().date_naive() - parsed).num_days() / 30;
            let measured = format!("{} (driver {}, dated {date})", g.name, g.version);
            Some(if months >= 12 {
                Finding::new("gpu_driver", "The graphics driver is over a year old", "gpu", "warning")
                    .detail(format!("{} is running a driver dated {date}.", g.name))
                    .impact("Game-specific. Driver updates regularly ship double-digit gains for new titles, and occasionally fix stutter bugs outright.")
                    .fix("Install the current driver from your GPU vendor (NVIDIA App, AMD Software or Intel Arc Control).")
                    .measured(measured)
            } else {
                Finding::new("gpu_driver", "The graphics driver is recent", "gpu", "ok")
                    .detail(format!("{} is running a driver dated {date}.", g.name))
                    .impact("Nothing to gain here.")
                    .measured(measured)
            })
        })
        .collect()
}
