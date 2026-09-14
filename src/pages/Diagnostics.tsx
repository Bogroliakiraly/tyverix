import { useEffect, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Info,
  RefreshCw,
  Stethoscope,
  Wrench,
} from "lucide-react";
import { runDiagnostics } from "../lib/api";
import type { Finding, FindingSeverity } from "../lib/types";
import { Badge, Card, EmptyState, SectionTitle, Spinner } from "../components/ui";
import { useNav } from "../store/useNav";
import { toast } from "../store/useToast";
import { useT } from "../i18n";

/**
 * The read-only half of the performance story — and usually the valuable half.
 * Memory left at its JEDEC fallback speed, a 165 Hz panel running at 60, a GPU
 * on a x4 link or thermally throttling: none of these can be fixed by a
 * registry value, and all of them cost far more frames than one.
 *
 * Findings that need the BIOS or a screwdriver say so explicitly, so the page
 * never implies Tyverix can do something it cannot.
 */
export function Diagnostics() {
  const { t } = useT();
  const go = useNav((s) => s.go);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOk, setShowOk] = useState(false);

  async function scan() {
    setLoading(true);
    try {
      setFindings(await runDiagnostics());
    } catch (e) {
      toast.error(t("diag.failed"), String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    scan();
  }, []);

  const problems = findings.filter(
    (f) => f.severity === "critical" || f.severity === "warning",
  );
  const rest = findings.filter(
    (f) => f.severity !== "critical" && f.severity !== "warning",
  );
  const visible = showOk ? findings : problems;

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle
          title={t("diag.title")}
          subtitle={t("diag.subtitle")}
          action={
            <button className="btn-ghost" onClick={scan} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {t("diag.scan")}
            </button>
          }
        />

        {loading ? (
          <Spinner label={t("diag.scanning")} />
        ) : findings.length === 0 ? (
          <EmptyState
            icon={<Stethoscope className="h-8 w-8" />}
            title={t("diag.empty")}
            message={t("diag.emptyMsg")}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`rounded-xl px-4 py-3 ${
                problems.length > 0 ? "bg-warn/10" : "bg-good/10"
              }`}
            >
              <p className="text-2xl font-semibold tabular-nums">
                {problems.length}
              </p>
              <p className="text-xs text-text-secondary">
                {problems.length > 0
                  ? t("diag.summaryProblems")
                  : t("diag.summaryAllGood")}
              </p>
            </div>
            <p className="max-w-md text-sm text-text-secondary">
              {problems.length > 0
                ? t("diag.summaryHint")
                : t("diag.summaryCleanHint")}
            </p>
            {rest.length > 0 && (
              <button
                className="btn-ghost ml-auto"
                onClick={() => setShowOk((v) => !v)}
              >
                {showOk
                  ? t("diag.hidePassing", { n: String(rest.length) })
                  : t("diag.showPassing", { n: String(rest.length) })}
              </button>
            )}
          </div>
        )}
      </Card>

      {!loading &&
        visible.map((f) => (
          <FindingCard key={f.id} finding={f} onOpenTweak={() => go("boost")} />
        ))}
    </div>
  );
}

const SEVERITY_ICON: Record<FindingSeverity, typeof Info> = {
  critical: AlertOctagon,
  warning: AlertTriangle,
  ok: CheckCircle2,
  info: Info,
  unknown: HelpCircle,
};

const SEVERITY_TONE: Record<
  FindingSeverity,
  "bad" | "warn" | "good" | "accent" | "neutral"
> = {
  critical: "bad",
  warning: "warn",
  ok: "good",
  info: "accent",
  unknown: "neutral",
};

function FindingCard({
  finding,
  onOpenTweak,
}: {
  finding: Finding;
  onOpenTweak: () => void;
}) {
  const { t } = useT();
  const Icon = SEVERITY_ICON[finding.severity];
  const tone = SEVERITY_TONE[finding.severity];
  const accent: Record<string, string> = {
    bad: "text-bad",
    warn: "text-warn",
    good: "text-good",
    accent: "text-accent",
    neutral: "text-text-muted",
  };

  return (
    <Card>
      <div className="flex gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${accent[tone]}`} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{finding.title}</h3>
            <Badge tone={tone}>{t(`diag.sev.${finding.severity}`)}</Badge>
            {finding.requires_bios && (
              <Badge tone="neutral">{t("diag.biosBadge")}</Badge>
            )}
          </div>

          <p className="text-sm text-text-secondary">{finding.detail}</p>

          {finding.impact && (
            <Row label={t("diag.impact")} value={finding.impact} />
          )}
          {finding.fix && <Row label={t("diag.fix")} value={finding.fix} />}
          {finding.measured && (
            <Row
              label={t("diag.measured")}
              value={finding.measured}
              mono
            />
          )}

          {finding.fix_tweak_id && (
            <button className="btn-outline" onClick={onOpenTweak}>
              <Wrench className="h-4 w-4" />
              {t("diag.fixInApp")}
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <span
        className={`text-sm ${mono ? "font-mono text-xs text-text-muted" : "text-text-secondary"}`}
      >
        {value}
      </span>
    </div>
  );
}
