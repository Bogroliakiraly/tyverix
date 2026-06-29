import { useEffect, useState } from "react";
import { Cpu, HardDrive, MemoryStick, Network, Microchip } from "lucide-react";
import { useMonitor } from "../hooks/useMonitor";
import { getGpuInfo, listDisks } from "../lib/api";
import type { DiskInfo, GpuInfo } from "../lib/types";
import { Gauge } from "../components/Gauge";
import { Sparkline } from "../components/Sparkline";
import { Card, SectionTitle } from "../components/ui";
import {
  formatBytes,
  formatBytesPerSec,
  formatUptime,
} from "../lib/format";
import { useT } from "../i18n";

export function Dashboard() {
  const { t } = useT();
  const { snapshot, history } = useMonitor(1000);
  const [gpus, setGpus] = useState<GpuInfo[]>([]);
  const [disks, setDisks] = useState<DiskInfo[]>([]);

  useEffect(() => {
    getGpuInfo().then(setGpus).catch(() => {});
    listDisks().then(setDisks).catch(() => {});
  }, []);

  const mem = snapshot?.memory;
  const memPct = mem && mem.total ? (mem.used / mem.total) * 100 : 0;
  const gpu = gpus[0];
  const netMax = Math.max(1, ...history.net);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Headline gauges */}
        <Card className="lg:col-span-2">
          <SectionTitle
            title={t("dash.overview")}
            subtitle={
              snapshot
                ? `${snapshot.cpu.brand} · ${snapshot.process_count} ${t("dash.processesSuffix")} · ${t(
                    "dash.upPrefix",
                  )} ${formatUptime(snapshot.uptime_secs)}`
                : t("dash.reading")
            }
          />
          <div className="flex flex-wrap items-center justify-around gap-4">
            <Gauge
              value={snapshot?.cpu.usage ?? 0}
              label={t("dash.cpu")}
              sub={
                snapshot?.cpu.logical_cores
                  ? `${snapshot.cpu.logical_cores} ${t("dash.threads")}`
                  : undefined
              }
            />
            <Gauge
              value={memPct}
              label={t("dash.memory")}
              sub={
                mem
                  ? `${formatBytes(mem.used)} / ${formatBytes(mem.total)}`
                  : undefined
              }
            />
            <Gauge
              value={gpu?.utilization ?? 0}
              available={gpu?.utilization != null}
              label="GPU"
              sub={gpu ? gpu.name : t("dash.detecting")}
            />
          </div>
        </Card>

        {/* Network */}
        <Card>
          <SectionTitle title={t("dash.network")} />
          <div className="flex items-center gap-2 text-text-secondary">
            <Network className="h-4 w-4" />
            <span className="text-sm">{t("dash.throughput")}</span>
          </div>
          <Sparkline data={history.net} max={netMax} color="#3ddc84" width={260} />
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-text-secondary">
              ↓ {formatBytesPerSec(snapshot?.network.rx_per_sec ?? 0)}
            </span>
            <span className="text-text-secondary">
              ↑ {formatBytesPerSec(snapshot?.network.tx_per_sec ?? 0)}
            </span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center gap-2 text-text-secondary">
            <Cpu className="h-4 w-4" />
            <span className="text-sm font-medium">{t("dash.cpuHistory")}</span>
          </div>
          <Sparkline data={history.cpu} max={100} color="#5b8cff" width={420} />
        </Card>
        <Card>
          <div className="mb-2 flex items-center gap-2 text-text-secondary">
            <MemoryStick className="h-4 w-4" />
            <span className="text-sm font-medium">{t("dash.memHistory")}</span>
          </div>
          <Sparkline data={history.mem} max={100} color="#f5b14c" width={420} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Top processes */}
        <Card>
          <SectionTitle title={t("dash.topProcesses")} subtitle={t("dash.byCpu")} />
          <div className="space-y-1.5">
            {snapshot?.top_processes.slice(0, 8).map((p) => (
              <div
                key={p.pid}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-bg-hover"
              >
                <span className="truncate text-sm">{p.name}</span>
                <div className="flex items-center gap-4 text-xs tabular-nums text-text-secondary">
                  <span>{formatBytes(p.memory)}</span>
                  <span className="w-12 text-right">
                    {p.cpu_usage.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Storage + GPU detail */}
        <div className="space-y-5">
          <Card>
            <SectionTitle title={t("dash.storage")} />
            <div className="space-y-3">
              {disks.map((d) => {
                const used = d.total - d.available;
                const pct = d.total ? (used / d.total) * 100 : 0;
                return (
                  <div key={d.mount_point}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <HardDrive className="h-3.5 w-3.5 text-text-muted" />
                        {d.mount_point} · {d.kind}
                      </span>
                      <span className="text-text-secondary">
                        {formatBytes(d.available)} {t("dash.free")}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-bg-hover">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <div className="mb-2 flex items-center gap-2 text-text-secondary">
              <Microchip className="h-4 w-4" />
              <span className="text-sm font-medium">{t("dash.graphics")}</span>
            </div>
            {gpus.length === 0 ? (
              <p className="text-sm text-text-muted">{t("dash.detectingGpu")}</p>
            ) : (
              gpus.map((g, i) => (
                <div key={i} className="text-sm">
                  <p className="font-medium">{g.name}</p>
                  <p className="text-text-secondary">
                    {t("dash.driver")} {g.driver_version ?? t("common.unknown")}
                    {g.vram_total ? ` · ${formatBytes(g.vram_total)} ${t("dash.vram")}` : ""}
                  </p>
                  {g.utilization == null && (
                    <p className="mt-1 text-xs text-text-muted">{t("dash.gpuNote")}</p>
                  )}
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
