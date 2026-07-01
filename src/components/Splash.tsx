import { motion } from "framer-motion";
import { useT } from "../i18n";
import logo from "../assets/logo.png";

/**
 * Startup splash: shown for a few seconds while the window first paints, then
 * fades out via AnimatePresence in main.tsx. Purely cosmetic — no data
 * dependency, so it never blocks or delays anything real.
 */
export function Splash() {
  const { t } = useT();
  return (
    <motion.div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-bg-base"
      exit={{ opacity: 0, transition: { duration: 0.45, ease: "easeInOut" } }}
    >
      <div className="relative grid h-24 w-24 place-items-center">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-2xl border border-accent/50"
            initial={{ opacity: 0.6, scale: 0.7 }}
            animate={{ opacity: 0, scale: 1.9 }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              ease: "easeOut",
              delay: i * 0.5,
            }}
          />
        ))}
        <motion.div
          className="grid h-24 w-24 place-items-center"
          initial={{ opacity: 0, scale: 0.6, rotate: -20 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
        >
          <motion.img
            src={logo}
            alt="Tyverix"
            className="h-20 w-20 object-contain drop-shadow-[0_0_18px_rgba(91,140,255,0.45)]"
            animate={{ rotate: [0, -6, 6, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
          />
        </motion.div>
      </div>

      <motion.div
        className="flex flex-col items-center gap-1"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.4 }}
      >
        <span className="text-xl font-semibold tracking-tight text-text-primary">
          Tyverix
        </span>
        <span className="text-xs text-text-muted">{t("nav.tagline")}</span>
      </motion.div>

      <div className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-bg-hover">
        <motion.div
          className="h-full rounded-full bg-accent"
          initial={{ x: "-100%" }}
          animate={{ x: "100%" }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </motion.div>
  );
}
