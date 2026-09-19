# Tyverix

A trustworthy Windows gaming optimization tool. **Every optimization is
measurable, reversible and safe.** No fake benchmarks, no placebo "FPS boosts",
no registry tweaks without a documented, verifiable benefit. When a metric
cannot be read accurately (e.g. live GPU load), Tyverix says *"Not available"*
instead of inventing a number.

> Windows 10 & Windows 11 only.

Website: <https://tyverix.com> · Contact: <info@tyverix.com>

## Tech stack

| Layer    | Technology                                   |
| -------- | -------------------------------------------- |
| Shell    | [Tauri v2](https://v2.tauri.app/) (Rust)     |
| UI       | React + TypeScript + Vite                    |
| Styling  | TailwindCSS                                  |
| Motion   | Framer Motion                                |
| Metrics  | `sysinfo`, Windows registry, `powercfg`, WMI |

## What it does (and how it stays honest)

| Feature                  | Implementation                                                        | Reversible |
| ------------------------ | -------------------------------------------------------------------- | ---------- |
| Live CPU/RAM/Net monitor | `sysinfo` — real OS counters                                         | read-only  |
| GPU name + driver        | WMI `Win32_VideoController`. Live GPU load is **not faked**.         | read-only  |
| **Diagnostics**          | RAM rated vs configured speed (XMP/EXPO), channel population, display refresh rate vs panel maximum (`EnumDisplaySettings`), PCIe link width via PnP device properties, Resizable BAR + throttle flags via `nvidia-smi`, page file, free space, driver age | read-only |
| **A/B benchmark**        | PresentMon frame times, per-second block means, Welch's t-test with a 95% confidence interval. Reports **"no measurable change"** when the interval spans zero | read-only |
| **Performance tweaks**   | 15 documented registry / `powercfg` settings (HAGS, MPO, fullscreen optimizations, MMCSS, power throttling, Game DVR, mouse acceleration, Nagle, …). Exact previous value written to `tweaks.json` **before** the change | ✅ |
| Process monitor / kill   | `sysinfo` + native terminate                                         | ❌ permanent |
| Startup manager          | Everything Task Manager's *Startup apps* lists: `Run` (HKCU, HKLM and 32-bit `WOW6432Node`), both Startup folders, sign-in/boot scheduled tasks, and Microsoft Store startup tasks. Each is toggled with Windows' own switch (`StartupApproved` flags, the task's Enabled flag, the package's `State`); nothing is ever deleted | ✅ |
| Cleaner                  | Only temp / shader / browser caches / Recycle Bin; in-use files skipped | ❌ permanent (restore point offered) |
| Disk usage + health      | `sysinfo` + `Get-PhysicalDisk` reliability counters                  | read-only  |
| Game Mode                | Switches to High/Ultimate Performance power plan; saves & restores previous | ✅ |
| Safety                   | System Restore points, registry export, full undo history, revert-all-tweaks | ✅ |

The complete reversibility reference lives in two places that must agree: the
app's **Safety** page, and <https://tyverix.com/changes.html>, so a user can
read it before installing.

Things Tyverix **deliberately refuses to do**: disable system services for
marginal gains, delete the Prefetch folder, touch the boot timer or HPET, claim
fixed FPS numbers, or make irreversible changes without a clear warning.

### Why there is no "one-click boost"

The tweaks page tops out at an honest `medium` expected impact, and says so.
No registry value reliably buys double-digit frame rate on a healthy machine —
the changes that do are hardware and firmware ones (memory speed, refresh rate,
PCIe link, cooling), which `commands::diagnostics` can only *report*. Claiming
otherwise is what every other optimizer does, and it is the one thing this
product cannot afford to do.

## Prerequisites

- **Node.js 18+** (you have it)
- **Rust toolchain** — install from <https://rustup.rs> (the MSVC toolchain is
  recommended). On Windows you also need the **Microsoft C++ Build Tools**
  (`Desktop development with C++` workload, or the standalone Build Tools).
- **WebView2 runtime** — preinstalled on Windows 11 and current Windows 10.

## Develop

```bash
npm install
npm run tauri:dev      # hot-reloading desktop window
```

## Build the installer / .exe

```bash
npm run tauri:build
```

Output:

- `src-tauri/target/release/Tyverix.exe` — the standalone binary
- `src-tauri/target/release/bundle/nsis/Tyverix_0.1.0_x64-setup.exe` — installer

## Notes on permissions

Some actions require administrator rights and will surface a clear error if run
without them:

- All-users (HKLM) startup items
- System Restore point creation
- Cleaning `C:\Windows\Temp`

Run Tyverix as administrator to enable these.

## Architecture

```
src/                     React UI
  components/             Reusable, animated primitives + dialogs
  pages/                 One screen per feature
  hooks/useMonitor.ts    Visibility-aware live polling
  lib/api.ts             Typed wrappers over every Tauri command
  store/                 Toasts + the global safety-confirm dialog
src-tauri/src/
  commands/              One module per feature area (the real work)
  state.rs               Shared sysinfo handles + persisted undo log
  util.rs                PowerShell/WMI helpers + JSON parsing
  error.rs               Single serializable error type
```
