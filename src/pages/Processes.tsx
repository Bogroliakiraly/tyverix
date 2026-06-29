import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";
import { killProcess, listProcesses } from "../lib/api";
import type { ProcessInfo } from "../lib/types";
import { Card, SectionTitle, Spinner } from "../components/ui";
import { formatBytes } from "../lib/format";
import { useConfirm } from "../store/useConfirm";
import { toast } from "../store/useToast";
import { useT } from "../i18n";

type SortKey = "cpu" | "memory" | "name";

export function Processes() {
  const { t } = useT();
  const [procs, setProcs] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("cpu");
  const ask = useConfirm((s) => s.ask);

  async function load() {
    setLoading(true);
    try {
      setProcs(await listProcesses());
    } catch (e) {
      toast.error(t("proc.toastFailedList"), String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = window.setInterval(load, 3000);
    return () => window.clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    const filtered = procs.filter((p) =>
      p.name.toLowerCase().includes(query.toLowerCase()),
    );
    filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      const key = sort === "cpu" ? "cpu_usage" : "memory";
      return b[key] - a[key];
    });
    return filtered.slice(0, 200);
  }, [procs, query, sort]);

  async function kill(p: ProcessInfo) {
    const { ok } = await ask({
      title: t("proc.confirmTitle", { name: p.name, pid: p.pid }),
      what: t("proc.confirmWhat", { name: p.name }),
      why: t("proc.confirmWhy"),
      benefit: t("proc.confirmBenefit", { size: formatBytes(p.memory) }),
      downside: t("proc.confirmDownside"),
      confirmLabel: t("proc.confirmLabel"),
      danger: true,
    });
    if (!ok) return;
    try {
      await killProcess(p.pid);
      toast.success(t("proc.toastEnded"), p.name);
      load();
    } catch (e) {
      toast.error(t("proc.toastFailedEnd"), String(e));
    }
  }

  return (
    <Card>
      <SectionTitle
        title={t("proc.title")}
        subtitle={t("proc.subtitle")}
        action={
          <button className="btn-ghost" onClick={load}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </button>
        }
      />

      <div className="mb-3 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("proc.filterPlaceholder")}
            className="selectable w-full rounded-xl border border-border-subtle bg-bg-base py-2 pl-9 pr-3 text-sm outline-none focus:border-accent"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-xl border border-border-subtle bg-bg-base px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="cpu">{t("proc.sortCpu")}</option>
          <option value="memory">{t("proc.sortMemory")}</option>
          <option value="name">{t("proc.sortName")}</option>
        </select>
      </div>

      {loading && procs.length === 0 ? (
        <Spinner label={t("proc.enumerating")} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-subtle">
          <table className="w-full text-sm">
            <thead className="bg-bg-base text-left text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{t("proc.colProcess")}</th>
                <th className="px-3 py-2 font-medium">{t("proc.colPid")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("proc.colCpu")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("proc.colMemory")}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.pid}
                  className="border-t border-border-subtle hover:bg-bg-hover"
                >
                  <td className="max-w-[280px] truncate px-3 py-1.5" title={p.exe ?? p.name}>
                    {p.name}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-text-secondary">
                    {p.pid}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {p.cpu_usage.toFixed(1)}%
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatBytes(p.memory)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      onClick={() => kill(p)}
                      className="rounded-md p-1 text-text-muted hover:bg-bad/15 hover:text-bad"
                      title={t("common.endProcess")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
