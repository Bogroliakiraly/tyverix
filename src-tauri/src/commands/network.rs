//! Real network latency measurement for multiplayer gaming.
//!
//! Rather than parsing the localized output of the `ping` tool (Windows
//! localizes "Reply from" / packet-loss summaries per system language, which
//! makes that text unreliable to parse), this measures actual TCP
//! connection-establishment round trips to the target host. That is a real,
//! reproducible network measurement — just not literally ICMP — so the UI
//! describes it accurately rather than calling it "ping".

use std::net::{TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::error::{AppError, AppResult};

#[derive(Serialize)]
pub struct LatencyResult {
    pub host: String,
    pub port: u16,
    pub sent: u32,
    pub received: u32,
    pub lost: u32,
    pub min_ms: f64,
    pub max_ms: f64,
    pub avg_ms: f64,
    pub jitter_ms: f64,
    pub samples_ms: Vec<f64>,
}

#[tauri::command]
pub fn measure_latency(host: String, port: u16, samples: u32) -> AppResult<LatencyResult> {
    let samples = samples.clamp(1, 20);
    let target = format!("{host}:{port}");
    let addr = target
        .to_socket_addrs()
        .map_err(|e| AppError::other(format!("could not resolve {host}: {e}")))?
        .next()
        .ok_or_else(|| AppError::other(format!("could not resolve {host}")))?;

    let mut times = Vec::new();
    let mut lost = 0u32;
    for i in 0..samples {
        let start = Instant::now();
        match TcpStream::connect_timeout(&addr, Duration::from_secs(2)) {
            Ok(_) => times.push(start.elapsed().as_secs_f64() * 1000.0),
            Err(_) => lost += 1,
        }
        if i + 1 < samples {
            std::thread::sleep(Duration::from_millis(150));
        }
    }

    if times.is_empty() {
        return Err(AppError::other(format!(
            "{host}:{port} did not accept a connection — it may be offline or block this port"
        )));
    }

    let avg = times.iter().sum::<f64>() / times.len() as f64;
    let min = times.iter().cloned().fold(f64::INFINITY, f64::min);
    let max = times.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let variance = times.iter().map(|t| (t - avg).powi(2)).sum::<f64>() / times.len() as f64;
    let jitter = variance.sqrt();

    Ok(LatencyResult {
        host,
        port,
        sent: samples,
        received: times.len() as u32,
        lost,
        min_ms: round2(min),
        max_ms: round2(max),
        avg_ms: round2(avg),
        jitter_ms: round2(jitter),
        samples_ms: times.into_iter().map(round2).collect(),
    })
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}
