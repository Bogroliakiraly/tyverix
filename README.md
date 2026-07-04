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
| Live CPU/RAM/Net monitor | `sysinfo` — real OS counters                                         | n/a        |
| GPU name + driver        | WMI `Win32_VideoController`. Live GPU load is **not faked**.         | n/a        |
| Process monitor / kill   | `sysinfo` + native terminate                                         | n/a        |
| Startup manager          | Registry `Run` keys + Startup folder; disabled entries are **backed up** byte-for-byte | ✅ |
| Cleaner                  | Only temp / shader / browser caches / Recycle Bin; in-use files skipped | restore point offered |
| Disk usage + health      | `sysinfo` + `Get-PhysicalDisk` reliability counters                  | n/a        |
| Large file finder        | Bounded recursive walk — never deletes for you                      | n/a        |
| Game Mode                | Switches to High/Ultimate Performance power plan; saves & restores previous | ✅ |
| Drivers / Software / Services / Windows info | WMI + registry, read-only                       | n/a        |
| Windows Update check      | Windows Update agent COM API                                        | n/a        |
| Safety                   | System Restore points, registry export, full undo history           | ✅          |

Things Tyverix **deliberately refuses to do**: disable system services for
marginal gains, delete the Prefetch folder, claim fixed FPS numbers, or make
irreversible changes without a clear warning.

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
