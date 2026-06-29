import { useEffect, useState } from "react";
import { RefreshCw, Rocket } from "lucide-react";
import { listStartupItems, setStartupEnabled } from "../lib/api";
import type { StartupItem, StartupLocation } from "../lib/types";
import { Badge, Card, EmptyState, SectionTitle, Spinner, Toggle } from "../components/ui";
import { useConfirm } from "../store/useConfirm";
import { toast } from "../store/useToast";
import { useT } from "../i18n";

export function Startup() {
  const { t } = useT();
  const [items, setItems] = useState<StartupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const ask = useConfirm((s) => s.ask);

  const locationLabel: Record<StartupLocation, string> = {
    registry_hkcu_run: t("startup.loc.hkcu"),
    registry_hklm_run: t("startup.loc.hklm"),
    startup_folder_user: t("startup.loc.folderUser"),
    startup_folder_common: t("startup.loc.folderCommon"),
  };

  async function load() {
    setLoading(true);
    try {
      setItems(await listStartupItems());
    } catch (e) {
      toast.error(t("startup.toastFailedRead"), String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(item: StartupItem) {
    const enabling = !item.enabled;
    if (!enabling) {
      const { ok } = await ask({
        title: t("startup.confirmTitle", { name: item.name }),
        what: t("startup.confirmWhat", { name: item.name }),
        why: t("startup.confirmWhy"),
        benefit: t("startup.confirmBenefit"),
        downside: t("startup.confirmDownside"),
        confirmLabel: t("startup.confirmLabel"),
      });
      if (!ok) return;
    }

    setBusy(item.id);
    try {
      await setStartupEnabled(item.id, enabling);
      setItems((prev) =>
        prev.map((x) => (x.id === item.id ? { ...x, enabled: enabling } : x)),
      );
      toast.success(
        enabling ? t("startup.toastEnabled") : t("startup.toastDisabled"),
        t("startup.toastReversible", { name: item.name }),
      );
    } catch (e) {
      toast.error(t("startup.toastFailedChange"), String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <SectionTitle
        title={t("startup.title")}
        subtitle={t("startup.subtitle")}
        action={
          <button className="btn-ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </button>
        }
      />

      {loading ? (
        <Spinner label={t("startup.reading")} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Rocket className="h-8 w-8" />}
          title={t("startup.empty")}
          message={t("startup.emptyMsg")}
        />
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-bg-hover"
            >
              <Toggle
                checked={item.enabled}
                disabled={busy === item.id}
                onChange={() => toggle(item)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{item.name}</span>
                  {!item.enabled && <Badge tone="warn">{t("startup.disabled")}</Badge>}
                </div>
                <p className="truncate text-xs text-text-muted" title={item.command}>
                  {item.command}
                </p>
              </div>
              <Badge>{locationLabel[item.location]}</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
