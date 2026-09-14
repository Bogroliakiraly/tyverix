import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Cpu,
  Gauge,
  MonitorCog,
  Mouse,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { listTweaks, revertAllTweaks, setTweak } from "../lib/api";
import type { TweakInfo } from "../lib/types";
import { Badge, Card, EmptyState, SectionTitle, Spinner, Toggle } from "../components/ui";
import { useConfirm } from "../store/useConfirm";
import { useNav } from "../store/useNav";
import { toast } from "../store/useToast";
import { useT } from "../i18n";

const CATEGORY_ICON: Record<string, typeof Cpu> = {
  gpu: MonitorCog,
  cpu: Cpu,
  system: Gauge,
  input: Mouse,
  network: Wifi,
};

/**
 * Every tweak here is reversible, and the page says so on each row rather than
 * once in the small print — including the distinction that matters: whether
 * Tyverix holds the machine's *actual* previous value, or would fall back to
 * Windows' documented default because the setting was changed outside the app.
 */
export function Boost() {
  const { t } = useT();
  const go = useNav((s) => s.go);
  const ask = useConfirm((s) => s.ask);
  const [tweaks, setTweaks] = useState<TweakInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setTweaks(await listTweaks());
    } catch (e) {
      toast.error(t("boost.failedRead"), String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const order = ["gpu", "cpu", "system", "input", "network"];
    const map = new Map<string, TweakInfo[]>();
    for (const tw of tweaks) {
      const list = map.get(tw.category) ?? [];
      list.push(tw);
      map.set(tw.category, list);
    }
    return order
      .filter((c) => map.has(c))
      .map((c) => [c, map.get(c)!] as const);
  }, [tweaks]);

  const appliedCount = tweaks.filter((x) => x.applied).length;
  const restartPending = tweaks.some((x) => x.applied && x.requires_restart);

  async function toggle(tw: TweakInfo) {
    const enabling = !tw.applied;
    const { ok } = await ask({
      title: enabling
        ? t("boost.confirmApplyTitle", { name: tw.name })
        : t("boost.confirmRevertTitle", { name: tw.name }),
      what: enabling ? tw.description : tw.revert_note,
      why: tw.benefit,
      benefit: t(`boost.impact.${tw.impact}`),
      downside: enabling ? tw.downside : t("boost.revertDownside"),
      confirmLabel: enabling ? t("boost.apply") : t("boost.revert"),
      offerRestorePoint: enabling && tw.requires_admin,
    });
    if (!ok) return;

    setBusy(tw.id);
    try {
      const updated = await setTweak(tw.id, enabling);
      setTweaks((prev) => prev.map((x) => (x.id === tw.id ? updated : x)));
      toast.success(
        enabling ? t("boost.toastApplied") : t("boost.toastReverted"),
        tw.requires_restart && enabling
          ? t("boost.toastRestart")
          : t("boost.toastReversible"),
      );
    } catch (e) {
      toast.error(t("boost.toastFailed"), String(e));
    } finally {
      setBusy(null);
    }
  }

  async function revertEverything() {
    const { ok } = await ask({
      title: t("boost.revertAllTitle"),
      what: t("boost.revertAllWhat"),
      why: t("boost.revertAllWhy"),
      benefit: t("boost.revertAllBenefit"),
      downside: t("boost.revertAllDownside"),
      confirmLabel: t("boost.revertAll"),
    });
    if (!ok) return;

    setBusy("__all__");
    try {
      const n = await revertAllTweaks();
      toast.success(t("boost.revertAllDone"), t("boost.revertAllCount", { n: String(n) }));
      await load();
    } catch (e) {
      toast.error(t("boost.toastFailed"), String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle
          title={t("boost.title")}
          subtitle={t("boost.subtitle")}
          action={
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={load} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                {t("common.refresh")}
              </button>
              <button
                className="btn-outline"
                onClick={revertEverything}
                disabled={loading || appliedCount === 0 || busy !== null}
              >
                <RotateCcw className="h-4 w-4" />
                {t("boost.revertAll")}
              </button>
            </div>
          }
        />

        <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-good" />
            <div className="space-y-2 text-sm">
              <p className="font-medium">{t("boost.honestyTitle")}</p>
              <p className="text-text-secondary">{t("boost.honestyBody")}</p>
              <button className="btn-ghost px-0" onClick={() => go("bench")}>
                <Gauge className="h-4 w-4" />
                {t("boost.honestyCta")}
              </button>
            </div>
          </div>
        </div>

        {restartPending && (
          <p className="mt-3 rounded-xl bg-warn/10 px-4 py-3 text-sm text-warn">
            {t("boost.restartPending")}
          </p>
        )}
      </Card>

      {loading ? (
        <Card>
          <Spinner label={t("boost.reading")} />
        </Card>
      ) : tweaks.length === 0 ? (
        <Card>
          <EmptyState title={t("boost.empty")} />
        </Card>
      ) : (
        grouped.map(([category, list]) => {
          const Icon = CATEGORY_ICON[category] ?? Gauge;
          return (
            <Card key={category}>
              <div className="mb-4 flex items-center gap-2">
                <Icon className="h-4 w-4 text-text-muted" />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
                  {t(`boost.cat.${category}`)}
                </h3>
              </div>
              <div className="space-y-2">
                {list.map((tw) => (
                  <TweakRow
                    key={tw.id}
                    tweak={tw}
                    busy={busy === tw.id}
                    disabled={busy !== null}
                    onToggle={() => toggle(tw)}
                  />
                ))}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}

function TweakRow({
  tweak,
  busy,
  disabled,
  onToggle,
}: {
  tweak: TweakInfo;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  const impactTone =
    tweak.impact === "medium" ? "accent" : tweak.impact === "low" ? "neutral" : "warn";

  return (
    <div className="rounded-xl border border-border-subtle p-4">
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          <Toggle
            checked={tweak.applied}
            disabled={busy || disabled || !tweak.available}
            onChange={onToggle}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{tweak.name}</span>
            <Badge tone={impactTone}>{t(`boost.impactBadge.${tweak.impact}`)}</Badge>
            {/* The reversibility promise, stated per row rather than in the
                small print — and specific about which kind it is. */}
            <Badge tone="good">
              {tweak.has_backup
                ? t("boost.reversibleExact")
                : t("boost.reversibleDefault")}
            </Badge>
            {tweak.requires_restart && (
              <Badge tone="warn">{t("boost.restartRequired")}</Badge>
            )}
            {tweak.requires_admin && (
              <Badge tone="neutral">{t("boost.adminRequired")}</Badge>
            )}
          </div>

          <p className="text-sm text-text-secondary">{tweak.description}</p>

          {!tweak.available && tweak.unavailable_reason && (
            <p className="rounded-lg bg-bg-hover px-3 py-2 text-xs text-text-muted">
              {tweak.unavailable_reason}
            </p>
          )}

          <button
            className="flex items-center gap-1 text-xs font-medium text-accent"
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            />
            {open ? t("boost.hideDetails") : t("boost.showDetails")}
          </button>

          {open && (
            <div className="space-y-3 rounded-lg bg-bg-elevated p-3 text-sm">
              <Detail label={t("confirm.why")} value={tweak.benefit} />
              <Detail label={t("confirm.downside")} value={tweak.downside} />
              <Detail label={t("boost.revertLabel")} value={tweak.revert_note} />
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                  {t("boost.changesLabel")}
                </p>
                <ul className="space-y-1">
                  {tweak.changes.map((c) => (
                    <li
                      key={c}
                      className="break-all rounded bg-bg-base px-2 py-1 font-mono text-[11px] text-text-muted"
                    >
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p className="text-text-secondary">{value}</p>
    </div>
  );
}
