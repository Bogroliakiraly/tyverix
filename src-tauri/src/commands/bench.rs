//! A/B benchmarking: measure, change one thing, measure again — and then say
//! honestly whether the difference was real.
//!
//! This is the feature the rest of the app is built around. Every optimizer on
//! the market shows a number after "boosting"; almost none of them measure
//! anything, and the ones that do compare two single runs and call a 3%
//! difference an improvement. Frame rates vary run to run by more than that on
//! their own.
//!
//! So Tyverix does the statistics properly:
//!
//! * Frame times come from Intel PresentMon (Windows' own ETW present events).
//! * Each run is split into one-second blocks and the *block means* are
//!   compared, not the individual frames. Consecutive frame times are heavily
//!   autocorrelated, and a t-test over raw frames would declare almost any
//!   difference significant. Block means are close enough to independent for
//!   the test to mean what it says.
//! * The comparison is Welch's t-test (unequal variances), reported with a
//!   95% confidence interval on the change.
//! * If the interval spans zero, the verdict is "no measurable change" — even
//!   when the averages differ. That is the whole point.
//!
//! Runs are persisted, because the most important tweak to A/B test (HAGS)
//! requires a reboot between the two measurements.

use std::io::{BufRead, BufReader};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::path::BaseDirectory;
use tauri::{Emitter, Manager};

use crate::error::{AppError, AppResult};
use crate::util::{app_data_dir, blocking};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// One completed measurement.
#[derive(Serialize, Deserialize, Clone)]
pub struct BenchRun {
    /// "before" or "after".
    pub slot: String,
    pub label: String,
    pub captured_at: String,
    pub seconds: f64,
    pub frames: u64,
    pub avg_fps: f64,
    /// 99th-percentile frame time expressed as FPS.
    pub p1_low_fps: f64,
    /// 99.9th-percentile frame time expressed as FPS.
    pub p01_low_fps: f64,
    pub avg_frame_ms: f64,
    /// Standard deviation of frame times — the frame-pacing number.
    pub frame_ms_stddev: f64,
    /// Frames that took more than twice the run's median frame time.
    pub stutters: u64,
    pub stutters_per_min: f64,
    /// Per-second mean FPS. The comparison runs on these, and the UI draws
    /// them as the run's shape over time.
    pub blocks_fps: Vec<f64>,
    /// A free-text note the user attached, e.g. "HAGS on".
    pub note: String,
}

#[derive(Serialize, Clone)]
pub struct BenchComparison {
    pub before: BenchRun,
    pub after: BenchRun,
    pub avg_fps_delta: f64,
    pub avg_fps_delta_pct: f64,
    pub p1_low_delta_pct: f64,
    /// 95% confidence interval on the average-FPS change, in percent.
    pub ci_low_pct: f64,
    pub ci_high_pct: f64,
    pub p_value: f64,
    /// "improved" | "regressed" | "no_change" | "inconclusive"
    pub verdict: String,
    pub verdict_text: String,
    /// True when the run lengths are too short for the result to mean much.
    pub underpowered: bool,
}

#[derive(Serialize, Deserialize, Default)]
struct BenchStore {
    before: Option<BenchRun>,
    after: Option<BenchRun>,
}

#[derive(Clone, Serialize)]
struct BenchProgress {
    slot: String,
    elapsed_secs: f64,
    total_secs: f64,
    frames: u64,
    live_fps: f64,
}

fn store_path() -> AppResult<PathBuf> {
    Ok(app_data_dir()?.join("bench.json"))
}

fn load_store() -> BenchStore {
    store_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn save_store(s: &BenchStore) -> AppResult<()> {
    let text = serde_json::to_string_pretty(s).map_err(|e| AppError::Parse(e.to_string()))?;
    std::fs::write(store_path()?, text)?;
    Ok(())
}

// --- Commands -------------------------------------------------------------------

#[tauri::command]
pub async fn bench_get_runs() -> AppResult<Vec<BenchRun>> {
    blocking(move || {
        let s = load_store();
        Ok([s.before, s.after].into_iter().flatten().collect())
    })
    .await
}

#[tauri::command]
pub async fn bench_clear() -> AppResult<()> {
    blocking(move || save_store(&BenchStore::default())).await
}

/// Captures one run. `seconds` is clamped to a range where the statistics can
/// actually say something: below 20 s there are too few one-second blocks for
/// the t-test, above 180 s the user is just waiting.
#[tauri::command]
pub async fn bench_capture(
    app: tauri::AppHandle,
    pid: u32,
    label: String,
    slot: String,
    seconds: u32,
    note: String,
) -> AppResult<BenchRun> {
    if slot != "before" && slot != "after" {
        return Err(AppError::other("slot must be \"before\" or \"after\""));
    }
    let seconds = seconds.clamp(20, 180);

    blocking(move || {
        // PresentMon opens an ETW session; a live measurement from the FPS page
        // would collide with it.
        super::fps::stop_session();

        let exe = app
            .path()
            .resolve("bin/PresentMon-x64.exe", BaseDirectory::Resource)
            .map_err(|e| AppError::other(format!("PresentMon not found: {e}")))?;

        let mut child = Command::new(&exe)
            .args([
                "--process_id",
                &pid.to_string(),
                "--output_stdout",
                "--no_console_stats",
                "--stop_existing_session",
                "--terminate_on_proc_exit",
                "--v2_metrics",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| AppError::Command(format!("failed to start PresentMon: {e}")))?;

        let stdout = child.stdout.take().expect("piped stdout");
        let reader = BufReader::new(stdout);

        let started = Instant::now();
        let deadline = started + Duration::from_secs(seconds as u64);
        let mut ft_col: Option<usize> = None;
        let mut frame_times: Vec<f64> = Vec::new();
        // (second index, frame time) so blocks can be built without timestamps
        // from PresentMon itself.
        let mut block_of: Vec<usize> = Vec::new();
        let mut last_emit = Instant::now();

        for line in reader.lines() {
            if Instant::now() >= deadline {
                break;
            }
            let Ok(line) = line else { break };

            let Some(col) = ft_col else {
                ft_col = line.split(',').position(|h| {
                    let h = h.trim();
                    h.eq_ignore_ascii_case("FrameTime")
                        || h.eq_ignore_ascii_case("msBetweenPresents")
                });
                continue;
            };

            let Some(ft) = line.split(',').nth(col).and_then(|v| v.trim().parse::<f64>().ok())
            else {
                continue;
            };
            if !(ft.is_finite() && ft > 0.0) {
                continue;
            }

            let elapsed = started.elapsed();
            frame_times.push(ft);
            block_of.push(elapsed.as_secs() as usize);

            if last_emit.elapsed() >= Duration::from_millis(500) {
                last_emit = Instant::now();
                let recent: Vec<f64> = frame_times.iter().rev().take(120).copied().collect();
                let live = if recent.is_empty() {
                    0.0
                } else {
                    1000.0 / (recent.iter().sum::<f64>() / recent.len() as f64)
                };
                let _ = app.emit(
                    "bench-progress",
                    BenchProgress {
                        slot: slot.clone(),
                        elapsed_secs: elapsed.as_secs_f64(),
                        total_secs: seconds as f64,
                        frames: frame_times.len() as u64,
                        live_fps: live,
                    },
                );
            }
        }

        let _ = child.kill();
        let _ = child.wait();

        if frame_times.len() < 200 {
            return Err(AppError::Command(format!(
                "Only {} frames were captured. Make sure the game is running and in the foreground, and that Tyverix is running as administrator.",
                frame_times.len()
            )));
        }

        let run = summarize(
            &slot,
            &label,
            &note,
            started.elapsed().as_secs_f64(),
            &frame_times,
            &block_of,
        );

        let mut store = load_store();
        if slot == "before" {
            store.before = Some(run.clone());
            // A new baseline invalidates the previous "after" — otherwise the
            // page could compare two runs that were never a pair.
            store.after = None;
        } else {
            store.after = Some(run.clone());
        }
        save_store(&store)?;
        Ok(run)
    })
    .await
}

#[tauri::command]
pub async fn bench_compare() -> AppResult<BenchComparison> {
    blocking(move || {
        let store = load_store();
        let before = store
            .before
            .ok_or_else(|| AppError::other("no baseline run has been captured yet"))?;
        let after = store
            .after
            .ok_or_else(|| AppError::other("no second run has been captured yet"))?;
        Ok(compare(before, after))
    })
    .await
}

// --- Statistics --------------------------------------------------------------------

fn summarize(
    slot: &str,
    label: &str,
    note: &str,
    seconds: f64,
    frame_times: &[f64],
    block_of: &[usize],
) -> BenchRun {
    let n = frame_times.len() as f64;
    let mean_ft = frame_times.iter().sum::<f64>() / n;
    let variance = frame_times.iter().map(|f| (f - mean_ft).powi(2)).sum::<f64>() / n;

    let mut sorted = frame_times.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    // Same index convention as the live FPS readout in `commands::fps`, so the
    // two never disagree about the same run: the 1% low is the frame time at
    // which 99% of frames were faster, i.e. it *includes* the worst 1%.
    let pct = |p: f64| -> f64 {
        let idx = (sorted.len() as f64 * p) as usize;
        sorted[idx.min(sorted.len() - 1)]
    };
    let median = pct(0.5);
    let stutters = frame_times.iter().filter(|f| **f > median * 2.0).count() as u64;

    // Per-second block means, as FPS.
    let block_count = block_of.last().copied().unwrap_or(0) + 1;
    let mut sums = vec![0.0f64; block_count];
    let mut counts = vec![0u32; block_count];
    for (ft, b) in frame_times.iter().zip(block_of.iter()) {
        sums[*b] += ft;
        counts[*b] += 1;
    }
    let blocks_fps: Vec<f64> = sums
        .iter()
        .zip(counts.iter())
        // Drop blocks with too few frames — the first and last second are
        // usually partial and would skew the test.
        .filter(|(_, c)| **c >= 10)
        .map(|(s, c)| 1000.0 / (s / *c as f64))
        .collect();

    BenchRun {
        slot: slot.to_string(),
        label: label.to_string(),
        captured_at: chrono::Utc::now().to_rfc3339(),
        seconds,
        frames: frame_times.len() as u64,
        avg_fps: 1000.0 / mean_ft,
        p1_low_fps: 1000.0 / pct(0.99),
        p01_low_fps: 1000.0 / pct(0.999),
        avg_frame_ms: mean_ft,
        frame_ms_stddev: variance.sqrt(),
        stutters,
        stutters_per_min: if seconds > 0.0 {
            stutters as f64 / seconds * 60.0
        } else {
            0.0
        },
        blocks_fps,
        note: note.to_string(),
    }
}

fn mean(v: &[f64]) -> f64 {
    if v.is_empty() {
        return 0.0;
    }
    v.iter().sum::<f64>() / v.len() as f64
}

/// Sample variance (n-1 denominator).
fn sample_var(v: &[f64]) -> f64 {
    if v.len() < 2 {
        return 0.0;
    }
    let m = mean(v);
    v.iter().map(|x| (x - m).powi(2)).sum::<f64>() / (v.len() as f64 - 1.0)
}

fn compare(before: BenchRun, after: BenchRun) -> BenchComparison {
    let a = &before.blocks_fps;
    let b = &after.blocks_fps;

    let ma = mean(a);
    let mb = mean(b);
    let delta = mb - ma;
    let delta_pct = if ma > 0.0 { delta / ma * 100.0 } else { 0.0 };
    let p1_delta_pct = if before.p1_low_fps > 0.0 {
        (after.p1_low_fps - before.p1_low_fps) / before.p1_low_fps * 100.0
    } else {
        0.0
    };

    let underpowered = a.len() < 15 || b.len() < 15;

    // Welch's t-test on the per-second block means.
    let va = sample_var(a);
    let vb = sample_var(b);
    let na = a.len() as f64;
    let nb = b.len() as f64;
    let se = (va / na + vb / nb).sqrt();

    let (t, df, p_value, ci_low, ci_high) = if se > 0.0 && na >= 2.0 && nb >= 2.0 {
        let t = delta / se;
        // Welch–Satterthwaite degrees of freedom.
        let df = (va / na + vb / nb).powi(2)
            / ((va / na).powi(2) / (na - 1.0) + (vb / nb).powi(2) / (nb - 1.0));
        // With df in the tens the t distribution is close enough to normal for
        // a verdict; 1.96 is the 95% two-sided critical value.
        let p = 2.0 * (1.0 - normal_cdf(t.abs()));
        (t, df, p, delta - 1.96 * se, delta + 1.96 * se)
    } else {
        (0.0, 0.0, 1.0, delta, delta)
    };
    let _ = (t, df);

    let ci_low_pct = if ma > 0.0 { ci_low / ma * 100.0 } else { 0.0 };
    let ci_high_pct = if ma > 0.0 { ci_high / ma * 100.0 } else { 0.0 };

    // The interval, not the average, decides. If zero is inside it, the two
    // runs are not distinguishable no matter how different the means look.
    let (verdict, verdict_text) = if underpowered {
        (
            "inconclusive",
            format!(
                "Too little data to judge. Average FPS moved by {delta_pct:+.1}%, but with runs this short that is well inside normal run-to-run variation. Capture at least 30 seconds per run."
            ),
        )
    } else if ci_low_pct > 0.0 {
        (
            "improved",
            format!(
                "Real improvement: {delta_pct:+.1}% average FPS (95% confidence interval {ci_low_pct:+.1}% to {ci_high_pct:+.1}%, p = {p_value:.4}). 1% lows moved {p1_delta_pct:+.1}%."
            ),
        )
    } else if ci_high_pct < 0.0 {
        (
            "regressed",
            format!(
                "Real regression: {delta_pct:+.1}% average FPS (95% confidence interval {ci_low_pct:+.1}% to {ci_high_pct:+.1}%, p = {p_value:.4}). Revert the change — it made things worse."
            ),
        )
    } else {
        (
            "no_change",
            format!(
                "No measurable change. The averages differ by {delta_pct:+.1}%, but the 95% confidence interval ({ci_low_pct:+.1}% to {ci_high_pct:+.1}%) includes zero, so that difference is indistinguishable from run-to-run noise."
            ),
        )
    };

    BenchComparison {
        avg_fps_delta: delta,
        avg_fps_delta_pct: delta_pct,
        p1_low_delta_pct: p1_delta_pct,
        ci_low_pct,
        ci_high_pct,
        p_value,
        verdict: verdict.to_string(),
        verdict_text,
        underpowered,
        before,
        after,
    }
}

/// Standard normal CDF via the Abramowitz & Stegun 7.1.26 error-function
/// approximation (absolute error < 1.5e-7) — enough precision for a p-value
/// that is only ever compared against 0.05.
fn normal_cdf(x: f64) -> f64 {
    0.5 * (1.0 + erf(x / std::f64::consts::SQRT_2))
}

fn erf(x: f64) -> f64 {
    let sign = if x < 0.0 { -1.0 } else { 1.0 };
    let x = x.abs();
    let t = 1.0 / (1.0 + 0.327_591_1 * x);
    let y = 1.0
        - (((((1.061_405_429 * t - 1.453_152_027) * t) + 1.421_413_741) * t - 0.284_496_736) * t
            + 0.254_829_592)
            * t
            * (-x * x).exp();
    sign * y
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(slot: &str, blocks: Vec<f64>) -> BenchRun {
        BenchRun {
            slot: slot.into(),
            label: "test".into(),
            captured_at: String::new(),
            seconds: blocks.len() as f64,
            frames: blocks.len() as u64 * 100,
            avg_fps: mean(&blocks),
            p1_low_fps: mean(&blocks) * 0.8,
            p01_low_fps: mean(&blocks) * 0.7,
            avg_frame_ms: 1000.0 / mean(&blocks),
            frame_ms_stddev: 0.5,
            stutters: 0,
            stutters_per_min: 0.0,
            blocks_fps: blocks,
            note: String::new(),
        }
    }

    /// A slightly noisy but repeatable sequence, so the tests do not depend on
    /// a random number generator.
    fn noisy(center: f64, n: usize) -> Vec<f64> {
        (0..n)
            .map(|i| center + ((i * 7919) % 13) as f64 - 6.0)
            .collect()
    }

    #[test]
    fn erf_matches_known_values() {
        assert!((erf(0.0) - 0.0).abs() < 1e-6);
        assert!((erf(1.0) - 0.842_700_79).abs() < 1e-6);
        assert!((erf(-1.0) + 0.842_700_79).abs() < 1e-6);
        assert!((normal_cdf(0.0) - 0.5).abs() < 1e-6);
        assert!((normal_cdf(1.96) - 0.975).abs() < 1e-3);
    }

    /// The verdict that matters most: two runs of the same machine must not be
    /// reported as an improvement just because their averages differ a little.
    #[test]
    fn same_performance_is_reported_as_no_change() {
        let a = run("before", noisy(240.0, 45));
        let mut shifted = noisy(240.0, 45);
        shifted.rotate_left(3); // same distribution, different order
        let b = run("after", shifted);

        let c = compare(a, b);
        assert_eq!(c.verdict, "no_change", "{}", c.verdict_text);
        assert!(c.ci_low_pct < 0.0 && c.ci_high_pct > 0.0);
    }

    #[test]
    fn a_large_consistent_gain_is_reported_as_improved() {
        let a = run("before", noisy(200.0, 45));
        let b = run("after", noisy(240.0, 45));
        let c = compare(a, b);
        assert_eq!(c.verdict, "improved", "{}", c.verdict_text);
        assert!(c.avg_fps_delta_pct > 15.0);
        assert!(c.ci_low_pct > 0.0);
        assert!(c.p_value < 0.05);
    }

    #[test]
    fn a_large_consistent_loss_is_reported_as_regressed() {
        let a = run("before", noisy(240.0, 45));
        let b = run("after", noisy(200.0, 45));
        let c = compare(a, b);
        assert_eq!(c.verdict, "regressed", "{}", c.verdict_text);
        assert!(c.ci_high_pct < 0.0);
    }

    /// A tiny difference across very short runs is exactly the case every other
    /// optimizer reports as a win.
    #[test]
    fn short_runs_are_reported_as_inconclusive() {
        let a = run("before", noisy(240.0, 8));
        let b = run("after", noisy(246.0, 8));
        let c = compare(a, b);
        assert_eq!(c.verdict, "inconclusive", "{}", c.verdict_text);
    }

    #[test]
    fn summarize_computes_percentiles_and_blocks() {
        // 300 frames at 4 ms (250 FPS) with a few slow ones, over 3 seconds.
        let mut frames = vec![4.0f64; 297];
        frames.extend([20.0, 25.0, 30.0]);
        let blocks: Vec<usize> = (0..300).map(|i| i / 100).collect();

        let r = summarize("before", "game", "", 3.0, &frames, &blocks);
        assert_eq!(r.frames, 300);
        assert!((r.avg_fps - 1000.0 / r.avg_frame_ms).abs() < 1e-9);
        // The 1% low must reflect the three slow frames, not the average: the
        // 99th-percentile frame time here is the 20 ms one, i.e. 50 FPS.
        assert!((r.p1_low_fps - 50.0).abs() < 1e-6, "got {}", r.p1_low_fps);
        assert!(r.p01_low_fps < r.p1_low_fps);
        assert!(r.p1_low_fps < r.avg_fps);
        // Frames over twice the median (4 ms) are counted as stutters.
        assert_eq!(r.stutters, 3);
        assert_eq!(r.blocks_fps.len(), 3);
    }
}
