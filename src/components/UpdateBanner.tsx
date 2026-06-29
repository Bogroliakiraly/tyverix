import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, X, Rocket } from "lucide-react";
import { useUpdate } from "../store/useUpdate";
import { useT } from "../i18n";

/** A slim top banner that appears when a newer release is available. */
export function UpdateBanner() {
  const { phase, version, progress, check, install, dismiss } = useUpdate();
  const { t } = useT();

  useEffect(() => {
    // Silent check shortly after launch.
    const id = window.setTimeout(() => check(true), 2500);
    return () => window.clearTimeout(id);
  }, [check]);

  const show = phase === "available" || phase === "downloading";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden border-b border-accent/30 bg-accent/10"
        >
          <div className="flex items-center gap-3 px-5 py-2.5">
            <Rocket className="h-4 w-4 text-accent" />
            <span className="text-sm">
              {phase === "downloading"
                ? `${t("update.downloading")} ${progress}%`
                : t("update.newVersion", { v: version ?? "" })}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {phase === "available" && (
                <>
                  <button className="btn-primary py-1.5" onClick={install}>
                    <Download className="h-4 w-4" />
                    {t("update.install")}
                  </button>
                  <button
                    className="btn-ghost py-1.5"
                    onClick={dismiss}
                    aria-label={t("update.later")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
