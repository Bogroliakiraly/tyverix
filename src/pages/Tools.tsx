import { useEffect, useState } from "react";
import {
  checkWindowsUpdates,
  diskHealth,
  findLargeFiles,
  getWindowsInfo,
  listDrivers,
  listInstalledSoftware,
  listServices,
} from "../lib/api";
import type {
  DriverInfo,
  PhysicalDiskHealth,
  ServiceInfo,
  SoftwareInfo,
  UpdateInfo,
  WindowsInfo,
} from "../lib/types";
import { Download, FileText, ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Badge, Card, EmptyState, SectionTitle, Spinner } from "../components/ui";
import { formatBytes, formatUptime } from "../lib/format";
import { toast } from "../store/useToast";
import { useT } from "../i18n";

const TAB_IDS = [
  "windows",
  "diskHealth",
  "drivers",
  "updates",
  "software",
  "services",
  "largeFiles",
] as const;
type Tab = (typeof TAB_IDS)[number];

export function Tools() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("windows");

  const labels: Record<Tab, string> = {
    windows: t("tools.tabs.windows"),
    diskHealth: t("tools.tabs.diskHealth"),
    drivers: t("tools.tabs.drivers"),
    updates: t("tools.tabs.updates"),
    software: t("tools.tabs.software"),
    services: t("tools.tabs.services"),
    largeFiles: t("tools.tabs.largeFiles"),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {TAB_IDS.map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === id
                ? "bg-bg-elevated text-text-primary border border-border-subtle"
                : "text-text-secondary hover:bg-bg-hover"
            }`}
          >
            {labels[id]}
          </button>
        ))}
      </div>

      {tab === "windows" && <WindowsTab />}
      {tab === "diskHealth" && <DiskHealthTab />}
      {tab === "drivers" && <DriversTab />}
      {tab === "updates" && <UpdatesTab />}
      {tab === "software" && <SoftwareTab />}
      {tab === "services" && <ServicesTab />}
      {tab === "largeFiles" && <LargeFilesTab />}
    </div>
  );
}

function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    setLoading(true);
    fn()
      .then((d) => on && setData(d))
      .catch((e) => on && setError(String(e)))
      .finally(() => on && setLoading(false));
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading, error };
}

function WindowsTab() {
  const { t } = useT();
  const { data, loading } = useAsync<WindowsInfo>(getWindowsInfo);
  if (loading) return <Card><Spinner label={t("tools.windows.reading")} /></Card>;
  if (!data) return <Card><EmptyState title={t("tools.windows.unavailable")} /></Card>;
  const rows: [string, string][] = [
    [t("tools.windows.edition"), data.edition],
    [t("tools.windows.version"), `${data.display_version} (${data.version})`],
    [t("tools.windows.build"), data.build],
    [t("tools.windows.computerName"), data.computer_name],
    [t("tools.windows.installedRam"), formatBytes(data.installed_ram)],
    [t("tools.windows.uptime"), formatUptime(data.uptime_secs)],
  ];
  return (
    <Card>
      <SectionTitle title={t("tools.windows.title")} />
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between rounded-lg bg-bg-base px-3 py-2 text-sm">
            <dt className="text-text-secondary">{k}</dt>
            <dd className="selectable font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function DiskHealthTab() {
  const { t } = useT();
  const { data, loading, error } = useAsync<PhysicalDiskHealth[]>(diskHealth);
  return (
    <Card>
      <SectionTitle title={t("tools.disk.title")} subtitle={t("tools.disk.subtitle")} />
      {loading ? (
        <Spinner label={t("tools.disk.reading")} />
      ) : error ? (
        <EmptyState title={t("tools.disk.errorTitle")} message={error} />
      ) : (
        <div className="space-y-2">
          {data?.map((d, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl border border-border-subtle p-3.5">
              <div>
                <p className="font-medium">{d.friendly_name}</p>
                <p className="text-xs text-text-secondary">
                  {d.media_type} · {formatBytes(d.size)}
                  {d.temperature != null ? ` · ${d.temperature}°C` : ""}
                  {d.wear != null ? ` · ${d.wear}% wear` : ""}
                </p>
              </div>
              <Badge tone={d.health_status === "Healthy" ? "good" : "warn"}>
                {d.health_status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Best-effort, honest vendor links: official download page + release notes.
 *  BoostForge never guesses whether a driver is "outdated" — it points you to
 *  the manufacturer's own page so you can compare versions and read the actual
 *  changelog there. Unknown vendors fall back to a web search. */
function driverLinks(d: DriverInfo): { download: string; notes: string } {
  const s = `${d.provider} ${d.device_name}`.toLowerCase();
  const search = (suffix: string) =>
    `https://www.google.com/search?q=${encodeURIComponent(`${d.device_name} ${d.provider} ${suffix}`)}`;
  if (s.includes("nvidia"))
    return { download: "https://www.nvidia.com/Download/index.aspx", notes: "https://www.nvidia.com/en-us/geforce/drivers/" };
  if (s.includes("amd") || s.includes("advanced micro devices") || s.includes("radeon"))
    return { download: "https://www.amd.com/en/support/download/drivers.html", notes: "https://www.amd.com/en/resources/support-articles/release-notes.html" };
  if (s.includes("intel"))
    return { download: "https://www.intel.com/content/www/us/en/download-center/home.html", notes: search("driver release notes") };
  if (s.includes("realtek"))
    return { download: "https://www.realtek.com/Download/List?cate_id=584", notes: search("driver release notes") };
  return { download: search("driver download"), notes: search("driver release notes") };
}

function DriverRow({ d }: { d: DriverInfo }) {
  const { t } = useT();
  const links = driverLinks(d);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle p-3">
      <div className="min-w-0">
        <p className="truncate font-medium" title={d.device_name}>{d.device_name}</p>
        <p className="text-xs text-text-secondary">
          {d.provider} · v{d.driver_version}{d.driver_date ? ` · ${d.driver_date}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button className="btn-outline" onClick={() => openUrl(links.download)}>
          <Download className="h-4 w-4" /> {t("tools.drivers.update")}
        </button>
        <button className="btn-ghost" onClick={() => openUrl(links.notes)}>
          <FileText className="h-4 w-4" /> {t("tools.drivers.notes")}
        </button>
      </div>
    </div>
  );
}

function DriversTab() {
  const { t } = useT();
  const { data, loading } = useAsync<DriverInfo[]>(listDrivers);

  function openWindowsUpdate() {
    openUrl("ms-settings:windowsupdate").catch(() =>
      openUrl("https://support.microsoft.com/windows/update-drivers-manually-in-windows-ec62f46c-ff14-c91d-eead-d7126dc1f7b6"),
    );
  }

  return (
    <Card>
      <SectionTitle title={t("tools.drivers.title")} subtitle={t("tools.drivers.subtitle")} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-bg-base px-3 py-2.5">
        <p className="max-w-xl text-xs text-text-secondary">{t("tools.drivers.hint")}</p>
        <button className="btn-outline shrink-0" onClick={openWindowsUpdate}>
          <ExternalLink className="h-4 w-4" /> {t("tools.drivers.windowsUpdate")}
        </button>
      </div>
      {loading ? (
        <Spinner label={t("tools.drivers.reading")} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState title={t("tools.nothing")} />
      ) : (
        <div className="max-h-[60vh] space-y-2 overflow-auto">
          {(data ?? []).map((d, i) => (
            <DriverRow key={i} d={d} />
          ))}
        </div>
      )}
    </Card>
  );
}

function UpdatesTab() {
  const { t } = useT();
  const { data, loading, error } = useAsync<UpdateInfo[]>(checkWindowsUpdates);
  return (
    <Card>
      <SectionTitle title={t("tools.updates.title")} subtitle={t("tools.updates.subtitle")} />
      {loading ? (
        <Spinner label={t("tools.updates.reading")} />
      ) : error ? (
        <EmptyState title={t("tools.updates.errorTitle")} message={error} />
      ) : data && data.length === 0 ? (
        <EmptyState title={t("tools.updates.upToDateTitle")} message={t("tools.updates.upToDateMsg")} />
      ) : (
        <div className="space-y-2">
          {data?.map((u, i) => (
            <div key={i} className="rounded-xl border border-border-subtle p-3 text-sm">
              <p className="font-medium">{u.title}</p>
              <p className="text-xs text-text-secondary">
                {u.kb ?? ""} {u.severity ? `· ${u.severity}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SoftwareTab() {
  const { t } = useT();
  const { data, loading } = useAsync<SoftwareInfo[]>(listInstalledSoftware);
  return (
    <Card>
      <SectionTitle title={t("tools.software.title")} />
      {loading ? (
        <Spinner label={t("tools.software.reading")} />
      ) : (
        <SimpleTable
          head={[
            t("tools.software.colName"),
            t("tools.software.colVersion"),
            t("tools.software.colPublisher"),
            t("tools.software.colSize"),
          ]}
          rows={(data ?? []).map((s) => [
            s.name,
            s.version ?? "—",
            s.publisher ?? "—",
            s.estimated_size ? formatBytes(s.estimated_size) : "—",
          ])}
        />
      )}
    </Card>
  );
}

function ServicesTab() {
  const { t } = useT();
  const { data, loading } = useAsync<ServiceInfo[]>(listServices);
  return (
    <Card>
      <SectionTitle title={t("tools.services.title")} subtitle={t("tools.services.subtitle")} />
      {loading ? (
        <Spinner label={t("tools.services.reading")} />
      ) : (
        <SimpleTable
          head={[
            t("tools.services.colService"),
            t("tools.services.colStatus"),
            t("tools.services.colStartType"),
          ]}
          rows={(data ?? []).map((s) => [
            s.display_name,
            s.status,
            s.start_type,
          ])}
        />
      )}
    </Card>
  );
}

function LargeFilesTab() {
  const { t } = useT();
  const [root, setRoot] = useState("C:\\Users");
  const [minMb, setMinMb] = useState(200);
  const [files, setFiles] = useState<{ path: string; size: number }[]>([]);
  const [loading, setLoading] = useState(false);

  async function scan() {
    setLoading(true);
    try {
      const res = await findLargeFiles(root, minMb * 1024 * 1024);
      setFiles(res);
    } catch (e) {
      toast.error(t("tools.largeFiles.toastFailed"), String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <SectionTitle title={t("tools.largeFiles.title")} subtitle={t("tools.largeFiles.subtitle")} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={root}
          onChange={(e) => setRoot(e.target.value)}
          className="selectable flex-1 rounded-xl border border-border-subtle bg-bg-base px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder={t("tools.largeFiles.rootPlaceholder")}
        />
        <input
          type="number"
          value={minMb}
          onChange={(e) => setMinMb(Number(e.target.value))}
          className="w-28 rounded-xl border border-border-subtle bg-bg-base px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <span className="text-sm text-text-secondary">MB+</span>
        <button className="btn-primary" onClick={scan} disabled={loading}>
          {loading ? <Spinner /> : t("tools.largeFiles.scan")}
        </button>
      </div>
      {files.length > 0 && (
        <SimpleTable
          head={[t("tools.largeFiles.colFile"), t("tools.largeFiles.colSize")]}
          rows={files.map((f) => [f.path, formatBytes(f.size)])}
        />
      )}
    </Card>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: string[][] }) {
  const { t } = useT();
  if (rows.length === 0)
    return <EmptyState title={t("tools.nothing")} />;
  return (
    <div className="max-h-[60vh] overflow-auto rounded-xl border border-border-subtle">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-bg-base text-left text-xs uppercase tracking-wide text-text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border-subtle hover:bg-bg-hover">
              {r.map((c, j) => (
                <td key={j} className="selectable max-w-[360px] truncate px-3 py-1.5" title={c}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
