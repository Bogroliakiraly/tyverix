import { useEffect, useRef, useState } from "react";
import { Gamepad2, Zap, RotateCcw, Activity, XCircle, Gauge, Square } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import {
  applyGameMode,
  getGameModeStatus,
  killProcess,
  listFpsTargets,
  listPowerPlans,
  listProcesses,
  restoreGameMode,
  setPowerPlan,
  startFpsMeasure,
  stopFpsMeasure,
} from "../lib/api";
import type { FpsSample, FpsTarget, GameModeStatus, PowerPlan, ProcessInfo } from "../lib/types";
import { Badge, Card, SectionTitle, Spinner } from "../components/ui";
import { ProGate } from "../components/ProGate";
import { useConfirm } from "../store/useConfirm";
import { toast } from "../store/useToast";
import { useT } from "../i18n";
import { formatBytes } from "../lib/format";

export function GameMode() {
  const { t } = useT();
  const [status, setStatus] = useState<GameModeStatus | null>(null);
  const [plans, setPlans] = useState<PowerPlan[]>([]);
  const [busy, setBusy] = useState(false);
  const ask = useConfirm((s) => s.ask);

  async function refresh() {
    try {
      const [s, p] = await Promise.all([getGameModeStatus(), listPowerPlans()]);
      setStatus(s);
      setPlans(p);
    } catch (e) {
      toast.error(t("game.toastFailedRead"), String(e));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function enable() {
    const { ok } = await ask({
      title: t("game.confirmTitle"),
      what: t("game.confirmWhat"),
      why: t("game.confirmWhy"),
      benefit: t("game.confirmBenefit"),
      downside: t("game.confirmDownside"),
      confirmLabel: t("game.confirmLabel"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      setStatus(await applyGameMode());
      toast.success(t("game.toastEngaged"), t("game.toastEngagedDesc"));
    } catch (e) {
      toast.error(t("game.toastEngageFailed"), String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      setStatus(await restoreGameMode());
      toast.success(t("game.toastDisabled"), t("game.toastDisabledDesc"));
    } catch (e) {
      toast.error(t("game.toastRestoreFailed"), String(e));
    } finally {
      setBusy(false);
    }
  }

  async function choosePlan(guid: string) {
    try {
      await setPowerPlan(guid);
      await refresh();
      toast.success(t("game.toastPlanChanged"));
    } catch (e) {
      toast.error(t("game.toastPlanFailed"), String(e));
    }
  }

  const active = status?.active ?? false;
  const detected = status?.detected_games ?? [];

  return (
    <ProGate>
    <div className="space-y-5">
      {!active && detected.length > 0 && (
        <Card className="border-accent/40 bg-accent/5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">
                {t("game.detectedPrefix")} {detected.join(", ")}
              </p>
              <p className="text-xs text-text-secondary">{t("game.detectedNote")}</p>
            </div>
            <button className="btn-primary shrink-0" onClick={enable} disabled={busy}>
              {busy ? <Spinner /> : <><Zap className="h-4 w-4" /> {t("game.engageNow")}</>}
            </button>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div
              className={`grid h-14 w-14 place-items-center rounded-2xl ${
                active ? "bg-accent/20 text-accent" : "bg-bg-hover text-text-muted"
              }`}
            >
              <Gamepad2 className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                {t("game.heading")} {active && <Badge tone="good">{t("game.active")}</Badge>}
              </h2>
              <p className="text-sm text-text-secondary">{t("game.description")}</p>
            </div>
          </div>
          {active ? (
            <button className="btn-outline" onClick={disable} disabled={busy}>
              {busy ? <Spinner /> : <><RotateCcw className="h-4 w-4" /> {t("game.restore")}</>}
            </button>
          ) : (
            <button className="btn-primary" onClick={enable} disabled={busy}>
              {busy ? <Spinner /> : <><Zap className="h-4 w-4" /> {t("game.engage")}</>}
            </button>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
          <Effect
            title={t("game.effectPowerPlan")}
            on={t("game.effectPowerPlanOn")}
            off={t("game.effectPowerPlanOff")}
            whenOffLabel={t("game.whenOff")}
          />
          <Effect
            title={t("game.effectParking")}
            on={t("game.effectParkingOn")}
            off={t("game.effectParkingOff")}
            whenOffLabel={t("game.whenOff")}
          />
          <Effect
            title={t("game.effectClose")}
            on={t("game.effectCloseOn")}
            off="—"
            whenOffLabel={t("game.whenOff")}
          />
          <Effect
            title={t("game.effectDvr")}
            on={t("game.effectDvrOn")}
            off={t("game.effectDvrOff")}
            whenOffLabel={t("game.whenOff")}
          />
          <Effect
            title={t("game.effectGpu")}
            on={t("game.effectGpuOn")}
            off={t("game.effectGpuOff")}
            whenOffLabel={t("game.whenOff")}
          />
          <Effect
            title={t("game.effectPriority")}
            on={t("game.effectPriorityOn")}
            off={t("game.effectPriorityOff")}
            whenOffLabel={t("game.whenOff")}
          />
        </div>
        <p className="mt-4 text-xs text-text-muted">{t("game.note")}</p>
      </Card>

      <FpsCard />

      <LiveConsumers />

      <Card>
        <SectionTitle title={t("game.plansTitle")} subtitle={t("game.plansSubtitle")} />
        <div className="space-y-1.5">
          {plans.length === 0 && <Spinner label={t("game.readingPlans")} />}
          {plans.map((p) => (
            <button
              key={p.guid}
              onClick={() => choosePlan(p.guid)}
              className={`flex w-full items-center justify-between rounded-xl border px-4 py-2.5 text-left transition-colors ${
                p.active
                  ? "border-accent bg-accent/10"
                  : "border-border-subtle hover:bg-bg-hover"
              }`}
            >
              <span className="text-sm font-medium">{p.name}</span>
              {p.active && <Badge tone="accent">{t("game.active")}</Badge>}
            </button>
          ))}
        </div>
      </Card>
    </div>
    </ProGate>
  );
}

/**
 * Real FPS measurement via the bundled Intel PresentMon: reads Windows' own
 * frame (present) events, so every number is measured, never estimated. This
 * is how Game Mode's effect can be judged honestly — measure, change, measure.
 */
function FpsCard() {
  const { t } = useT();
  const [targets, setTargets] = useState<FpsTarget[]>([]);
  const [measuring, setMeasuring] = useState<FpsTarget | null>(null);
  const [sample, setSample] = useState<FpsSample | null>(null);
  const [busy, setBusy] = useState(false);
  const measuringRef = useRef(measuring);
  measuringRef.current = measuring;

  // Refresh the target list while idle so a freshly launched game appears.
  useEffect(() => {
    let stopped = false;
    async function tick() {
      if (measuringRef.current) return;
      try {
        const list = await listFpsTargets();
        if (!stopped) setTargets(list);
      } catch {
        /* transient; retried on next tick */
      }
    }
    tick();
    const id = setInterval(tick, 4000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const unSample = listen<FpsSample>("fps-sample", (e) => setSample(e.payload));
    const unEnded = listen<{ process: string; reason: string }>("fps-ended", () => {
      setMeasuring(null);
    });
    return () => {
      unSample.then((u) => u());
      unEnded.then((u) => u());
    };
  }, []);

  async function start(target: FpsTarget) {
    setBusy(true);
    try {
      await startFpsMeasure(target.pid, target.label);
      setSample(null);
      setMeasuring(target);
    } catch (e) {
      toast.error(t("game.fpsFailed"), String(e));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      await stopFpsMeasure();
    } catch {
      /* session may have already ended with the game */
    } finally {
      setMeasuring(null);
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle title={t("game.fpsTitle")} subtitle={t("game.fpsSubtitle")} />
      {measuring ? (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <Badge tone="accent">{t("game.fpsMeasuring", { name: measuring.label })}</Badge>
            <button className="btn-outline" onClick={stop} disabled={busy}>
              <Square className="h-4 w-4" /> {t("game.fpsStop")}
            </button>
          </div>
          {sample ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <FpsStat label="FPS" value={sample.fps.toFixed(0)} big />
              <FpsStat label={t("game.fpsFrameTime")} value={`${sample.frame_time_ms.toFixed(1)} ms`} />
              <FpsStat label={t("game.fpsLow")} value={sample.fps_low_1.toFixed(0)} />
              <FpsStat
                label={t("game.fpsFrames")}
                value={`${sample.frames} · ${Math.round(sample.elapsed_secs)}s`}
              />
            </div>
          ) : (
            <Spinner label={t("game.fpsWaiting")} />
          )}
        </div>
      ) : targets.length === 0 ? (
        <p className="text-sm text-text-secondary">{t("game.fpsNoTarget")}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {targets.map((g) => (
            <button
              key={g.pid}
              className="btn-primary"
              onClick={() => start(g)}
              disabled={busy}
            >
              {busy ? <Spinner /> : <><Gauge className="h-4 w-4" /> {t("game.fpsStart", { name: g.label })}</>}
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-text-muted">{t("game.fpsNote")}</p>
    </Card>
  );
}

function FpsStat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-xl border border-border-subtle p-3 text-center">
      <p className={`font-semibold tabular-nums ${big ? "text-3xl text-accent" : "text-xl"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs uppercase tracking-wide text-text-muted">{label}</p>
    </div>
  );
}

/**
 * Live view of what is eating CPU and memory right now, refreshed every 3
 * seconds from real OS counters (the same source as the Processes page).
 * Lets the player end a heavy background process before launching a game.
 */
function LiveConsumers() {
  const { t } = useT();
  const ask = useConfirm((s) => s.ask);
  const [procs, setProcs] = useState<ProcessInfo[] | null>(null);

  useEffect(() => {
    let stopped = false;
    async function tick() {
      try {
        const list = await listProcesses();
        if (!stopped) setProcs(list);
      } catch {
        // Keep showing the last good sample; the next tick retries.
      }
    }
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  async function endProcess(p: ProcessInfo) {
    const { ok } = await ask({
      title: t("proc.confirmTitle", { name: p.name, pid: p.pid }),
      what: t("proc.confirmWhat", { name: p.name }),
      why: t("proc.confirmWhy"),
      benefit: t("proc.confirmBenefit", { size: formatBytes(p.memory) }),
      downside: t("proc.confirmDownside"),
      confirmLabel: t("proc.confirmLabel"),
      danger: true,
    });
    if (!ok) return;
    try {
      await killProcess(p.pid);
      toast.success(t("proc.confirmLabel"), p.name);
      setProcs((cur) => (cur ? cur.filter((x) => x.pid !== p.pid) : cur));
    } catch (e) {
      toast.error(t("common.error"), String(e));
    }
  }

  const notSelf = (p: ProcessInfo) => !/^tyverix/i.test(p.name);
  const topCpu = (procs ?? []).filter(notSelf).sort((a, b) => b.cpu_usage - a.cpu_usage).slice(0, 5);
  const topRam = (procs ?? []).filter(notSelf).sort((a, b) => b.memory - a.memory).slice(0, 5);

  return (
    <Card>
      <SectionTitle title={t("game.liveTitle")} subtitle={t("game.liveSubtitle")} />
      {procs === null ? (
        <Spinner />
      ) : topCpu.length === 0 ? (
        <p className="text-sm text-text-secondary">{t("game.liveEmpty")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ConsumerList
            label={t("game.liveCpu")}
            items={topCpu}
            metric={(p) => `${p.cpu_usage.toFixed(1)}%`}
            onEnd={endProcess}
            endLabel={t("game.liveKill")}
          />
          <ConsumerList
            label={t("game.liveRam")}
            items={topRam}
            metric={(p) => formatBytes(p.memory)}
            onEnd={endProcess}
            endLabel={t("game.liveKill")}
          />
        </div>
      )}
    </Card>
  );
}

function ConsumerList({
  label,
  items,
  metric,
  onEnd,
  endLabel,
}: {
  label: string;
  items: ProcessInfo[];
  metric: (p: ProcessInfo) => string;
  onEnd: (p: ProcessInfo) => void;
  endLabel: string;
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
        <Activity className="h-3.5 w-3.5" /> {label}
      </p>
      <div className="space-y-1.5">
        {items.map((p) => (
          <div
            key={p.pid}
            className="flex items-center gap-3 rounded-xl border border-border-subtle px-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className="shrink-0 font-semibold tabular-nums">{metric(p)}</span>
            <button
              className="btn-ghost shrink-0 !px-2 !py-1 text-xs text-bad"
              onClick={() => onEnd(p)}
              title={endLabel}
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Effect({
  title,
  on,
  off,
  whenOffLabel,
}: {
  title: string;
  on: string;
  off: string;
  whenOffLabel: string;
}) {
  return (
    <div className="rounded-xl border border-border-subtle p-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{title}</p>
      <p className="mt-1 text-text-primary">{on}</p>
      <p className="text-xs text-text-secondary">
        {whenOffLabel} {off}
      </p>
    </div>
  );
}
