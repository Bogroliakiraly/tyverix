import { useState, type ReactNode } from "react";
import { Wifi, Zap } from "lucide-react";
import { measureLatency } from "../lib/api";
import type { LatencyResult } from "../lib/types";
import { Badge, Card, EmptyState, SectionTitle, Spinner } from "../components/ui";
import { Sparkline } from "../components/Sparkline";
import { toast } from "../store/useToast";
import { useT } from "../i18n";

const PRESETS = [
  { label: "Cloudflare", host: "1.1.1.1", port: 443 },
  { label: "Google", host: "8.8.8.8", port: 443 },
];

export function Network() {
  const { t } = useT();
  const [host, setHost] = useState("1.1.1.1");
  const [port, setPort] = useState(443);
  const [samples, setSamples] = useState(10);
  const [result, setResult] = useState<LatencyResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!host.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await measureLatency(host.trim(), port, samples);
      setResult(r);
    } catch (e) {
      toast.error(t("net.toastFailed"), String(e));
    } finally {
      setBusy(false);
    }
  }

  const jitterTone =
    result == null ? "neutral" : result.jitter_ms < 5 ? "good" : result.jitter_ms < 15 ? "accent" : "warn";
  const jitterLabel =
    jitterTone === "good" ? t("net.stable") : jitterTone === "accent" ? t("net.moderate") : t("net.unstable");

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle title={t("net.title")} subtitle={t("net.subtitle")} />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder={t("net.hostPlaceholder")}
            className="selectable min-w-[220px] flex-1 rounded-xl border border-border-subtle bg-bg-base px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            className="w-20 rounded-xl border border-border-subtle bg-bg-base px-3 py-2 text-sm outline-none focus:border-accent"
            title={t("net.port")}
          />
          <input
            type="number"
            value={samples}
            onChange={(e) => setSamples(Number(e.target.value))}
            className="w-20 rounded-xl border border-border-subtle bg-bg-base px-3 py-2 text-sm outline-none focus:border-accent"
            title={t("net.samples")}
          />
          <button className="btn-primary" onClick={run} disabled={busy || !host.trim()}>
            {busy ? <Spinner /> : <><Zap className="h-4 w-4" /> {t("net.measure")}</>}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setHost(p.host);
                setPort(p.port);
              }}
              className="rounded-lg border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:bg-bg-hover"
            >
              {p.label}
            </button>
          ))}
        </div>
      </Card>

      {busy && (
        <Card>
          <Spinner label={t("net.connecting", { host, port, n: samples })} />
        </Card>
      )}

      {!busy && result && (
        <Card>
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent/15 text-accent">
              <Wifi className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium">
                {result.host}:{result.port}
              </p>
              <p className="text-xs text-text-secondary">
                {t("net.succeeded", { received: result.received, sent: result.sent })}
                {result.lost > 0 ? ` · ${t("net.timedOut", { n: result.lost })}` : ""}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("net.avg")} value={`${result.avg_ms} ms`} />
            <Stat label={t("net.min")} value={`${result.min_ms} ms`} />
            <Stat label={t("net.max")} value={`${result.max_ms} ms`} />
            <Stat
              label={t("net.jitter")}
              value={`${result.jitter_ms} ms`}
              badge={<Badge tone={jitterTone as "good" | "accent" | "warn"}>{jitterLabel}</Badge>}
            />
          </div>

          {result.samples_ms.length > 1 && (
            <div className="mt-5">
              <p className="mb-2 text-xs uppercase tracking-wide text-text-muted">{t("net.sampleChart")}</p>
              <Sparkline
                data={result.samples_ms}
                max={Math.max(...result.samples_ms) * 1.2}
                color="#5b8cff"
              />
            </div>
          )}

          <p className="mt-4 text-xs text-text-muted">{t("net.note")}</p>
        </Card>
      )}

      {!busy && !result && (
        <Card>
          <EmptyState title={t("net.emptyTitle")} message={t("net.emptyMsg")} />
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, badge }: { label: string; value: string; badge?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border-subtle p-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <p className="text-lg font-semibold">{value}</p>
        {badge}
      </div>
    </div>
  );
}
