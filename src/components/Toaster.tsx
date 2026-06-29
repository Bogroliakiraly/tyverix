import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, TriangleAlert, XCircle, X } from "lucide-react";
import { useToast, type ToastKind } from "../store/useToast";

const icons: Record<ToastKind, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warn: TriangleAlert,
  error: XCircle,
};

const tones: Record<ToastKind, string> = {
  info: "text-accent",
  success: "text-good",
  warn: "text-warn",
  error: "text-bad",
};

export function Toaster() {
  const toasts = useToast((s) => s.toasts);
  const dismiss = useToast((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = icons[t.kind];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
              className="pointer-events-auto card flex items-start gap-3 p-3.5"
            >
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tones[t.kind]}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.message && (
                  <p className="mt-0.5 text-xs text-text-secondary break-words">
                    {t.message}
                  </p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="text-text-muted hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
