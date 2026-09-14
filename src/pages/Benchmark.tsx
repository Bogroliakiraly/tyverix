import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowDownRight,
  ArrowUpRight,
  FlaskConical,
  Minus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  benchCapture,
  benchClear,
  benchCompare,
  benchGetRuns,
  listFpsTargets,
} from "../lib/api";
import type {
  BenchComparison,
  BenchProgress,
  BenchRun,
  FpsTarget,
} from "../lib/types";
import { Badge, Card, EmptyState, SectionTitle, Spinner } from "../components/ui";
import { ProGate } from "../components/ProGate";
import { toast } from "../store/useToast";
import { useT } from "../i18n";

/**
 * Measure, change one thing, measure again — then let the statistics decide.
 *
 * The point of this page is the verdict it is willing to give: "no measurable
 * change". Two runs whose confidence interval spans zero are not different, no
 * matter how far apart their averages landed, and saying so is the whole
 * reason the rest of the app can be trusted.
 */
export function Benchmark() {
  return (
    <ProGate>
      <BenchmarkInner />
    </ProGate>
  );
}

function BenchmarkInner() {
  const { t } = useT();
  const [targets, setTargets] = useState<FpsTarget[]>([]);
  const [pid, setPid] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(45);
  const [note, setNote] = useState("");
  const [runs, setRuns] = useState<BenchRun[]>([]);
  const [comparison, setComparison] = useState<BenchComparison | null>(null);
  const [capturing, setCapturing] = useState<"before" | "after" | null>(null);
  const [progress, setProgress] = useState<BenchProgress | null>(null);
  const unlisten = useRef<(() => void) | null>(null);

  async function refreshTargets() {
    try {
      const list = await listFpsTargets();
      setTargets(list);
      if (list.length > 0 && pid === null) setPid(list[0].pid);
    } catch {
      /* the empty state below already explains what to do */
    }
  }

  async function refreshRuns() {
    try {
      const list = await benchGetRuns();
      setRuns(list);
      if (list.length === 2) {
        setComparison(await benchCompare());
      } else {
        setComparison(null);
      }
    } catch {
      setComparison(null);
    }
  }

  useEffect(() => {
    refreshTargets();
    refreshRuns();
    listen<BenchProgress>("bench-progress", (e) => setProgress(e.payload)).then(
      (u) => (unlisten.current = u),
    );
    return () => unlisten.current?.();
  }, []);

  const before = runs.find((r) => r.slot === "before") ?? null;
  const after = runs.find((r) => r.slot === "after") ?? null;

  async function capture(slot: "before" | "after") {
    if (pid === null) return;
    const label = targets.find((x) => x.pid === pid)?.label ?? `PID ${pid}`;
    setCapturing(slot);
    setProgress(null);
    try {
      await benchCapture(pid, label, slot, seconds, note);
      toast.success(t("bench.captured"), t("bench.capturedMsg"));
      setNote("");
      await refreshRuns();
    } catch (e) {
      toast.error(t("bench.failed"), String(e));
    } finally {
      setCapturing(null);
      setProgress(null);
    }
  }

  async function clearRuns() {
    await benchClear();
    setComparison(null);
    await refreshRuns();
  }

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle
          title={t("bench.title")}
          subtitle={t("bench.subtitle")}
          action={
            <button className="btn-ghost" onClick={refreshTargets}>
              <RefreshCw className="h-4 w-4" />
              {t("common.refresh")}
            </button>
          }
        />

        <ol className="mb-5 grid gap-3 sm:grid-cols-3">
          {["bench.step1", "bench.step2", "bench.step3"].map((key, i) => (
            <li
              key={key}
              className="rounded-xl border border-border-subtle bg-bg-elevated p-3"
            >
              <span className="text-xs font-semibold text-accent">
                {t("bench.stepLabel", { n: String(i + 1) })}
              </span>
              <p className="mt-1 text-sm text-text-secondary">{t(key)}</p>
            </li>
          ))}
        </ol>

        {targets.length === 0 ? (
          <EmptyState
            icon={<FlaskConical className="h-8 w-8" />}
            title={t("bench.noGames")}
            message={t("bench.noGamesMsg")}
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t("bench.game")}>
                <select
                  className="w-full rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-sm"
                  value={pid ?? ""}
                  onChange={(e) => setPid(Number(e.target.value))}
                  disabled={capturing !== null}
                >
                  {targets.map((x) => (
                    <option key={x.pid} value={x.pid}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("bench.duration")}>
                <select
                  className="w-full rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-sm"
                  value={seconds}
                  onChange={(e) => setSeconds(Number(e.target.value))}
                  disabled={capturing !== null}
                >
                  {[30, 45, 60, 90, 120].map((s) => (
                    <option key={s} value={s}>
                      {t("bench.durationOption", { n: String(s) })}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("bench.note")}>
                <input
                  className="w-full rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-sm"
                  placeholder={t("bench.notePlaceholder")}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={capturing !== null}
                />
              </Field>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="btn-primary"
                onClick={() => capture("before")}
                disabled={capturing !== null || pid === null}
              >
                {t("bench.captureBefore")}
              </button>
              <button
                className="btn-outline"
                onClick={() => capture("after")}
                disabled={capturing !== null || pid === null || !before}
              >
                {t("bench.captureAfter")}
              </button>
              {runs.length > 0 && (
                <button
                  className="btn-ghost ml-auto"
                  onClick={clearRuns}
                  disabled={capturing !== null}
                >
                  <Trash2 className="h-4 w-4" />
                  {t("bench.clear")}
                </button>
              )}
            </div>

            {capturing && (
              <div className="rounded-xl bg-bg-elevated p-4">
                <Spinner
                  label={t("bench.capturing", {
                    slot: t(`bench.${capturing}`),
                  })}
                />
                {progress && (
                  <>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-hover">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            (progress.elapsed_secs / progress.total_secs) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-text-muted">
                      {t("bench.progress", {
                        elapsed: progress.elapsed_secs.toFixed(0),
                        total: progress.total_secs.toFixed(0),
                        fps: progress.live_fps.toFixed(0),
                        frames: String(progress.frames),
                      })}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {(before || after) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {before && <RunCard run={before} />}
          {after && <RunCard run={after} />}
        </div>
      )}

      {comparison && <Verdict comparison={comparison} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function RunCard({ run }: { run: BenchRun }) {
  const { t } = useT();
  return (
    <Card>
      <SectionTitle
        title={t(`bench.${run.slot}`)}
        subtitle={`${run.label}${run.note ? ` — ${run.note}` : ""}`}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("bench.avgFps")} value={run.avg_fps.toFixed(1)} />
        <Stat label={t("bench.low1")} value={run.p1_low_fps.toFixed(1)} />
        <Stat label={t("bench.low01")} value={run.p01_low_fps.toFixed(1)} />
        <Stat label={t("bench.pacing")} value={`${run.frame_ms_stddev.toFixed(2)} ms`} />
      </div>
      <Sparkline values={run.blocks_fps} />
      <p className="mt-3 text-xs text-text-muted">
        {t("bench.runFooter", {
          frames: String(run.frames),
          seconds: run.seconds.toFixed(0),
          stutters: String(run.stutters),
          perMin: run.stutters_per_min.toFixed(1),
        })}
      </p>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-bg-elevated px-3 py-2">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
    </div>
  );
}

/** The run's per-second shape — a flat line is a well-paced run. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 100 - ((v - min) / span) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="mt-4 h-16 w-full"
      role="img"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        className="text-accent"
      />
    </svg>
  );
}

function Verdict({ comparison }: { comparison: BenchComparison }) {
  const { t } = useT();
  const { verdict } = comparison;
  const tone =
    verdict === "improved"
      ? "good"
      : verdict === "regressed"
        ? "bad"
        : verdict === "inconclusive"
          ? "warn"
          : "neutral";
  const Icon =
    verdict === "improved"
      ? ArrowUpRight
      : verdict === "regressed"
        ? ArrowDownRight
        : Minus;
  const accent: Record<string, string> = {
    good: "text-good",
    bad: "text-bad",
    warn: "text-warn",
    neutral: "text-text-muted",
  };

  return (
    <Card>
      <div className="flex gap-3">
        <Icon className={`mt-1 h-6 w-6 shrink-0 ${accent[tone]}`} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{t(`bench.verdict.${verdict}`)}</h3>
            <Badge tone={tone as "good" | "bad" | "warn" | "neutral"}>
              {comparison.avg_fps_delta_pct >= 0 ? "+" : ""}
              {comparison.avg_fps_delta_pct.toFixed(1)}%
            </Badge>
          </div>
          <p className="text-sm text-text-secondary">{comparison.verdict_text}</p>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label={t("bench.deltaAvg")}
              value={`${comparison.avg_fps_delta_pct >= 0 ? "+" : ""}${comparison.avg_fps_delta_pct.toFixed(1)}%`}
            />
            <Stat
              label={t("bench.deltaLow1")}
              value={`${comparison.p1_low_delta_pct >= 0 ? "+" : ""}${comparison.p1_low_delta_pct.toFixed(1)}%`}
            />
            <Stat
              label={t("bench.ci")}
              value={`${comparison.ci_low_pct.toFixed(1)}% … ${comparison.ci_high_pct.toFixed(1)}%`}
            />
          </div>

          <p className="rounded-lg bg-bg-elevated p-3 text-xs text-text-muted">
            {t("bench.methodology")}
          </p>
        </div>
      </div>
    </Card>
  );
}
