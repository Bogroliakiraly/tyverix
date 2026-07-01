import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { AlertTriangle, Check, Info, ShieldCheck, X } from "lucide-react";
import { useConfirm } from "../store/useConfirm";
import { useT } from "../i18n";

/**
 * The single, app-wide confirmation surface. It enforces Tyverix's safety
 * contract: nothing impactful runs without showing what changes, why, the
 * expected benefit and the potential downside.
 */
export function ConfirmDialog() {
  const request = useConfirm((s) => s.request);
  const resolveWith = useConfirm((s) => s.resolveWith);
  const [restore, setRestore] = useState(true);
  const { t } = useT();

  return (
    <AnimatePresence>
      {request && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6"
          onClick={() => resolveWith(false, false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="w-full max-w-lg card p-0 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
              <div className="flex items-center gap-2.5">
                {request.danger ? (
                  <AlertTriangle className="h-5 w-5 text-warn" />
                ) : (
                  <ShieldCheck className="h-5 w-5 text-accent" />
                )}
                <h3 className="font-semibold">{request.title}</h3>
              </div>
              <button
                onClick={() => resolveWith(false, false)}
                className="text-text-secondary hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {request.message ? (
              <div className="px-5 py-5 text-sm text-text-secondary">{request.message}</div>
            ) : (
              <div className="space-y-3 px-5 py-4 text-sm">
                {request.what && <Row label={t("confirm.what")} value={request.what} />}
                {request.why && <Row label={t("confirm.why")} value={request.why} />}
                {request.benefit && <Row label={t("confirm.benefit")} value={request.benefit} tone="good" />}
                {request.downside && <Row label={t("confirm.downside")} value={request.downside} tone="warn" />}
              </div>
            )}

            {request.offerRestorePoint && (
              <label className="flex items-center gap-2.5 border-t border-border-subtle px-5 py-3 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={restore}
                  onChange={(e) => setRestore(e.target.checked)}
                  className="h-4 w-4 accent-[#5b8cff]"
                />
                <span className="text-text-secondary">
                  {t("confirm.restorePoint")}
                </span>
              </label>
            )}

            <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-3">
              <button
                className="btn-ghost"
                onClick={() => resolveWith(false, false)}
              >
                {request.cancelLabel ?? t("common.cancel")}
              </button>
              <button
                className={request.danger ? "btn-danger" : "btn-primary"}
                onClick={() =>
                  resolveWith(true, request.offerRestorePoint ? restore : false)
                }
              >
                <Check className="h-4 w-4" />
                {request.confirmLabel ?? t("common.proceed")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn";
}) {
  const Icon = tone === "good" ? Check : tone === "warn" ? AlertTriangle : Info;
  const color =
    tone === "good"
      ? "text-good"
      : tone === "warn"
        ? "text-warn"
        : "text-text-muted";
  return (
    <div className="flex gap-3">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
      <div>
        <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
        <p className="text-text-primary">{value}</p>
      </div>
    </div>
  );
}
