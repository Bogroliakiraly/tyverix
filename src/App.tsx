import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Gamepad2,
  Gauge as GaugeIcon,
  ListChecks,
  MemoryStick,
  Rocket,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
  Wifi,
  Wrench,
} from "lucide-react";
import { Sidebar, type NavItem } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Toaster } from "./components/Toaster";
import { UpdateBanner } from "./components/UpdateBanner";
import { Dashboard } from "./pages/Dashboard";
import { GameMode } from "./pages/GameMode";
import { Cleaner } from "./pages/Cleaner";
import { Startup } from "./pages/Startup";
import { Processes } from "./pages/Processes";
import { Memory } from "./pages/Memory";
import { Network } from "./pages/Network";
import { Tools } from "./pages/Tools";
import { Safety } from "./pages/Safety";
import { Settings } from "./pages/Settings";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isElevated } from "./lib/api";
import { useNav } from "./store/useNav";
import { useConfirm } from "./store/useConfirm";
import { useT } from "./i18n";

export default function App() {
  const page = useNav((s) => s.page);
  const setPage = useNav((s) => s.go);
  const [elevated, setElevated] = useState<boolean | null>(null);
  const ask = useConfirm((s) => s.ask);
  const { t } = useT();

  useEffect(() => {
    isElevated().then(setElevated).catch(() => setElevated(null));
  }, []);

  // Intercept window close (title-bar X or Alt+F4) and confirm first, so the
  // app can't be shut down by accident mid-task.
  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let closing = false;
    win
      .onCloseRequested(async (event) => {
        if (closing) return;
        event.preventDefault();
        const { ok } = await ask({
          title: t("close.title"),
          message: t("close.message"),
          confirmLabel: t("close.confirm"),
          cancelLabel: t("close.cancel"),
          danger: true,
        });
        if (ok) {
          closing = true;
          await win.destroy();
        }
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, [ask, t]);

  const nav: NavItem[] = [
    { id: "dashboard", label: t("nav.dashboard"), icon: GaugeIcon },
    { id: "game", label: t("nav.game"), icon: Gamepad2 },
    { id: "cleaner", label: t("nav.cleaner"), icon: Trash2 },
    { id: "memory", label: t("nav.memory"), icon: MemoryStick },
    { id: "network", label: t("nav.network"), icon: Wifi },
    { id: "startup", label: t("nav.startup"), icon: Rocket },
    { id: "processes", label: t("nav.processes"), icon: ListChecks },
    { id: "tools", label: t("nav.tools"), icon: Wrench },
    { id: "safety", label: t("nav.safety"), icon: ShieldCheck },
    { id: "settings", label: t("nav.settings"), icon: SettingsIcon },
  ];

  return (
    <div className="flex h-screen flex-col bg-bg-base">
      <TitleBar elevated={elevated} />
      <UpdateBanner />
      <div className="flex min-h-0 flex-1">
        <Sidebar items={nav} current={page} onNavigate={setPage} />
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              {page === "dashboard" && <Dashboard />}
              {page === "game" && <GameMode />}
              {page === "cleaner" && <Cleaner />}
              {page === "startup" && <Startup />}
              {page === "processes" && <Processes />}
              {page === "memory" && <Memory />}
              {page === "network" && <Network />}
              {page === "tools" && <Tools />}
              {page === "safety" && <Safety />}
              {page === "settings" && <Settings elevated={elevated} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <ConfirmDialog />
      <Toaster />
    </div>
  );
}
