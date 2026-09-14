import { useEffect, useState } from "react";
import {
  Eye,
  History,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Save,
  Undo2,
} from "lucide-react";
import {
  backupRegistry,
  createRestorePoint,
  listActionLog,
  undoAction,
} from "../lib/api";
import type { ActionRecord } from "../lib/types";
import { Badge, Card, EmptyState, SectionTitle, Spinner } from "../components/ui";
import { formatDate } from "../lib/format";
import { useConfirm } from "../store/useConfirm";
import { toast } from "../store/useToast";
import { useT } from "../i18n";

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export function Safety() {
  const { t } = useT();
  const [log, setLog] = useState<ActionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const ask = useConfirm((s) => s.ask);

  async function loadLog() {
    setLoading(true);
    try {
      setLog(await listActionLog());
    } catch (e) {
      toast.error(t("safety.toastFailedHistory"), String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLog();
  }, []);

  async function makeRestorePoint() {
    setBusy("rp");
    try {
      await createRestorePoint("Tyverix — manual checkpoint");
      toast.success(t("safety.toastRestoreCreated"));
    } catch (e) {
      toast.error(t("safety.toastRestoreFailed"), String(e) + " (requires admin + System Restore enabled)");
    } finally {
      setBusy(null);
    }
  }

  async function doBackup() {
    setBusy("reg");
    try {
      const path = await backupRegistry();
      toast.success(t("safety.toastRegBackedUp"), path);
    } catch (e) {
      toast.error(t("safety.toastBackupFailed"), String(e));
    } finally {
      setBusy(null);
    }
  }

  async function undo(rec: ActionRecord) {
    setBusy(rec.id);
    try {
      await undoAction(rec.id);
      toast.success(t("safety.toastReverted"), rec.description);
      await loadLog();
    } catch (e) {
      toast.error(t("safety.toastUndoFailed"), String(e));
    } finally {
      setBusy(null);
    }
  }

  const todaysPending = log.filter((r) => r.reversible && !r.undone && isToday(r.timestamp));

  async function undoAllToday() {
    const { ok } = await ask({
      title: t("safety.undoTodayConfirmTitle"),
      message: t("safety.undoTodayConfirmMsg", { n: todaysPending.length }),
      confirmLabel: t("safety.undoTodayConfirmLabel"),
      danger: true,
    });
    if (!ok) return;

    // Newest first: each record's undo restores to the state *before* that
    // specific action, so unwinding newest-to-oldest correctly rolls all the
    // way back to how things were before any of today's changes.
    const targets = [...todaysPending].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    setBusy("all-today");
    let succeeded = 0;
    let failed = 0;
    for (const rec of targets) {
      try {
        await undoAction(rec.id);
        succeeded++;
      } catch {
        failed++;
      }
    }
    setBusy(null);
    await loadLog();
    if (failed === 0) {
      toast.success(t("safety.toastUndoTodayDone", { n: succeeded }));
    } else {
      toast.warn(t("safety.toastUndoTodayPartial", { ok: succeeded, failed }));
    }
  }

  return (
    <div className="space-y-5">
      <ReversibilityReference />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Card>
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-accent" />
            <div>
              <h3 className="font-semibold">{t("safety.restoreTitle")}</h3>
              <p className="text-sm text-text-secondary">{t("safety.restoreDesc")}</p>
            </div>
          </div>
          <button className="btn-primary mt-4 w-full" onClick={makeRestorePoint} disabled={busy === "rp"}>
            {busy === "rp" ? <Spinner /> : <><ShieldCheck className="h-4 w-4" /> {t("safety.createRestore")}</>}
          </button>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <Save className="h-6 w-6 text-accent" />
            <div>
              <h3 className="font-semibold">{t("safety.regTitle")}</h3>
              <p className="text-sm text-text-secondary">{t("safety.regDesc")}</p>
            </div>
          </div>
          <button className="btn-outline mt-4 w-full" onClick={doBackup} disabled={busy === "reg"}>
            {busy === "reg" ? <Spinner /> : <><Save className="h-4 w-4" /> {t("safety.backupReg")}</>}
          </button>
        </Card>
      </div>

      <Card>
        <SectionTitle
          title={t("safety.historyTitle")}
          subtitle={t("safety.historySubtitle")}
          action={
            <div className="flex items-center gap-2">
              {todaysPending.length > 0 && (
                <button className="btn-outline" onClick={undoAllToday} disabled={busy === "all-today"}>
                  {busy === "all-today" ? <Spinner /> : <><Undo2 className="h-4 w-4" /> {t("safety.undoToday", { n: todaysPending.length })}</>}
                </button>
              )}
              <button className="btn-ghost" onClick={loadLog}>
                <History className="h-4 w-4" />
                {t("common.refresh")}
              </button>
            </div>
          }
        />
        {loading ? (
          <Spinner label={t("safety.reading")} />
        ) : log.length === 0 ? (
          <EmptyState
            icon={<History className="h-8 w-8" />}
            title={t("safety.empty")}
            message={t("safety.emptyMsg")}
          />
        ) : (
          <div className="space-y-1.5">
            {log.map((rec) => (
              <div key={rec.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-bg-hover">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{rec.description}</span>
                    {rec.undone && <Badge>{t("safety.reverted")}</Badge>}
                  </div>
                  <p className="text-xs text-text-muted">{formatDate(rec.timestamp)}</p>
                </div>
                {rec.reversible && !rec.undone && (
                  <button
                    className="btn-ghost"
                    onClick={() => undo(rec)}
                    disabled={busy === rec.id}
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t("safety.undo")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/** How each kind of change is classified. */
type Reversibility = "reversible" | "permanent" | "none";

/**
 * The plain-language record of what Tyverix can and cannot take back.
 *
 * It lives here, on the page people open when they are nervous, rather than
 * buried in a help article — and it lists the permanent operations first
 * among equals instead of hiding them. The same table is published on
 * tyverix.com/changes.html so the claim can be checked before installing.
 */
const REVERSIBILITY: { id: string; verdict: Reversibility }[] = [
  { id: "startup", verdict: "reversible" },
  { id: "tweaks", verdict: "reversible" },
  { id: "gamemode", verdict: "reversible" },
  { id: "powerplan", verdict: "reversible" },
  { id: "cleaner", verdict: "permanent" },
  { id: "killprocess", verdict: "permanent" },
  { id: "memory", verdict: "none" },
  { id: "readonly", verdict: "none" },
];

function ReversibilityReference() {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  const icon: Record<Reversibility, typeof Eye> = {
    reversible: RotateCcw,
    permanent: ShieldAlert,
    none: Eye,
  };
  const tone: Record<Reversibility, "good" | "warn" | "neutral"> = {
    reversible: "good",
    permanent: "warn",
    none: "neutral",
  };
  const color: Record<Reversibility, string> = {
    reversible: "text-good",
    permanent: "text-warn",
    none: "text-text-muted",
  };

  return (
    <Card>
      <SectionTitle
        title={t("reverse.title")}
        subtitle={t("reverse.subtitle")}
        action={
          <button className="btn-ghost" onClick={() => setOpen((v) => !v)}>
            {open ? t("reverse.hide") : t("reverse.show")}
          </button>
        }
      />
      {open && (
        <div className="space-y-2">
          {REVERSIBILITY.map((row) => {
            const Icon = icon[row.verdict];
            return (
              <div
                key={row.id}
                className="flex gap-3 rounded-xl border border-border-subtle p-3"
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color[row.verdict]}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {t(`reverse.${row.id}.title`)}
                    </span>
                    <Badge tone={tone[row.verdict]}>
                      {t(`reverse.verdict.${row.verdict}`)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-text-secondary">
                    {t(`reverse.${row.id}.note`)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
