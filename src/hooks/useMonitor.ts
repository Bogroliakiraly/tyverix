import { useEffect, useRef, useState } from "react";
import { getSystemSnapshot } from "../lib/api";
import type { SystemSnapshot } from "../lib/types";

const HISTORY = 60; // ~1 minute of samples at the default interval

export interface MonitorHistory {
  cpu: number[];
  mem: number[];
  net: number[]; // combined rx+tx bytes/s
}

/**
 * Polls the backend for a live system snapshot. The poll only runs while the
 * tab is visible so a backgrounded window costs essentially nothing — part of
 * keeping idle resource usage low.
 */
export function useMonitor(intervalMs = 1000) {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [history, setHistory] = useState<MonitorHistory>({
    cpu: [],
    mem: [],
    net: [],
  });
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const snap = await getSystemSnapshot();
        if (cancelled) return;
        setSnapshot(snap);
        const memPct = snap.memory.total
          ? (snap.memory.used / snap.memory.total) * 100
          : 0;
        const net = snap.network.rx_per_sec + snap.network.tx_per_sec;
        setHistory((h) => ({
          cpu: [...h.cpu, snap.cpu.usage].slice(-HISTORY),
          mem: [...h.mem, memPct].slice(-HISTORY),
          net: [...h.net, net].slice(-HISTORY),
        }));
      } catch {
        // Backend not ready yet (e.g. first render) — ignore and retry.
      }
    }

    function start() {
      if (timer.current != null) return;
      tick();
      timer.current = window.setInterval(tick, intervalMs);
    }
    function stop() {
      if (timer.current != null) {
        window.clearInterval(timer.current);
        timer.current = null;
      }
    }

    function onVisibility() {
      if (document.hidden) stop();
      else start();
    }

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);

  return { snapshot, history };
}
