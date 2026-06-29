import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Zap } from "lucide-react";
import { Badge } from "./ui";
import { useT } from "../i18n";

/**
 * Custom, frameless title bar (the OS chrome is disabled in tauri.conf.json)
 * so the window feels native to BoostForge's dark theme. The draggable region
 * uses Tauri's `data-tauri-drag-region` attribute.
 */
export function TitleBar({ elevated }: { elevated: boolean | null }) {
  const appWindow = getCurrentWindow();
  const { t } = useT();

  return (
    <div
      data-tauri-drag-region
      className="flex h-10 items-center justify-between border-b border-border-subtle bg-bg-base px-3 select-none"
    >
      <div data-tauri-drag-region className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/20">
          <Zap className="h-3.5 w-3.5 text-accent" />
        </div>
        <span className="text-sm font-semibold tracking-tight">BoostForge</span>
        {elevated === false && (
          <Badge tone="warn">{t("common.notAdministrator")}</Badge>
        )}
        {elevated === true && <Badge tone="good">{t("common.administrator")}</Badge>}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => appWindow.minimize()}
          className="grid h-7 w-9 place-items-center rounded-md text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          aria-label={t("common.minimize")}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          className="grid h-7 w-9 place-items-center rounded-md text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          aria-label={t("common.maximize")}
        >
          <Square className="h-3 w-3" />
        </button>
        <button
          onClick={() => appWindow.close()}
          className="grid h-7 w-9 place-items-center rounded-md text-text-secondary hover:bg-bad hover:text-white"
          aria-label={t("common.close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
