import { useState } from "react";
import { MemoryStick, Sparkles, ShieldCheck } from "lucide-react";
import { freeMemory, isElevated } from "../lib/api";
import type { MemoryFreeResult } from "../lib/types";
import { Card, SectionTitle, Spinner, Toggle } from "../components/ui";
import { formatBytes } from "../lib/format";
import { useConfirm } from "../store/useConfirm";
import { toast } from "../store/useToast";
import { useT } from "../i18n";

export function Memory() {
  const { t } = useT();
  const [purge, setPurge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MemoryFreeResult | null>(null);
  const ask = useConfirm((s) => s.ask);

  async function run() {
    const { ok } = await ask({
      title: t("mem.title"),
      what: t("mem.what"),
      why: t("mem.why"),
      benefit: t("mem.benefit"),
      downside: t("mem.downside"),
      confirmLabel: t("mem.freeNow"),
    });
    if (!ok) return;

    if (purge) {
      const elevated = await isElevated().catch(() => false);
      if (!elevated) {
        toast.warn(t("common.notAdministrator"), t("mem.purgeStandby"));
      }
    }

    setBusy(true);
    try {
      const r = await freeMemory(purge);
      setResult(r);
      const freed = Math.max(0, r.freed_bytes);
      toast.success(
        t("mem.freed") + ": " + formatBytes(freed),
        `${r.processes_trimmed} ${t("mem.trimmed")}`,
      );
    } catch (e) {
      toast.error(t("common.error"), String(e));
    } finally {
      setBusy(false);
    }
  }

  const usedPct =
    result && result.total
      ? ((result.total - result.available_after) / result.total) * 100
      : 0;

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle title={t("mem.title")} subtitle={t("mem.subtitle")} />

        <div className="flex flex-col items-center gap-4 py-4">
          <div className="grid h-20 w-20 place-items-center rounded-2xl bg-accent/15">
            <MemoryStick className="h-9 w-9 text-accent" />
          </div>
          <button className="btn-primary px-6 py-2.5 text-base" onClick={run} disabled={busy}>
            {busy ? <Spinner /> : <><Sparkles className="h-5 w-5" /> {t("mem.freeNow")}</>}
          </button>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <Toggle checked={purge} onChange={setPurge} />
            <span className="text-text-secondary">{t("mem.purgeStandby")}</span>
          </label>
        </div>

        {result && (
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label={t("mem.freed")} value={formatBytes(Math.max(0, result.freed_bytes))} accent />
            <Stat label={t("mem.available")} value={formatBytes(result.available_after)} />
            <Stat label={t("mem.trimmed")} value={String(result.processes_trimmed)} />
          </div>
        )}

        {result && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-text-secondary">
              <span>{t("mem.used")}</span>
              <span>{usedPct.toFixed(0)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-bg-hover">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${usedPct}%` }} />
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-good" />
          <p className="text-sm text-text-secondary leading-relaxed">{t("mem.honest")}</p>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border-subtle p-3 text-center">
      <p className={`text-xl font-semibold tabular-nums ${accent ? "text-accent" : ""}`}>{value}</p>
      <p className="mt-0.5 text-xs text-text-secondary">{label}</p>
    </div>
  );
}
