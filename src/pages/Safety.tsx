import { useEffect, useState } from "react";
import { History, RotateCcw, ShieldCheck, Save } from "lucide-react";
import {
  backupRegistry,
  createRestorePoint,
  listActionLog,
  undoAction,
} from "../lib/api";
import type { ActionRecord } from "../lib/types";
import { Badge, Card, EmptyState, SectionTitle, Spinner } from "../components/ui";
import { formatDate } from "../lib/format";
import { toast } from "../store/useToast";
import { useT } from "../i18n";

export function Safety() {
  const { t } = useT();
  const [log, setLog] = useState<ActionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

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
      await createRestorePoint("BoostForge — manual checkpoint");
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

  return (
    <div className="space-y-5">
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
            <button className="btn-ghost" onClick={loadLog}>
              <History className="h-4 w-4" />
              {t("common.refresh")}
            </button>
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
