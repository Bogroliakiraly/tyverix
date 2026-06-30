import type { ReactNode } from "react";
import { Crown, Lock } from "lucide-react";
import { useLicense } from "../store/useLicense";
import { useNav } from "../store/useNav";
import { useT } from "../i18n";
import { Card } from "./ui";

/**
 * Wraps Pro-only features. During the trial the user is treated as Pro, so the
 * gate only appears once the trial ends without an active subscription.
 *
 * `onUpgrade` defaults to navigating to Settings (where the subscription /
 * license-key card lives), so feature pages can use <ProGate> with no props.
 */
export function ProGate({
  children,
  onUpgrade,
}: {
  children: ReactNode;
  onUpgrade?: () => void;
}) {
  const isPro = useLicense((s) => s.isPro);
  const loaded = useLicense((s) => s.loaded);
  const go = useNav((s) => s.go);
  const { t } = useT();

  if (!loaded || isPro) return <>{children}</>;

  return (
    <Card className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-warn/15">
        <Lock className="h-8 w-8 text-warn" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">{t("license.proBadge")}</h3>
        <p className="mt-1 max-w-sm text-sm text-text-secondary">{t("license.upgrade")}</p>
      </div>
      <button className="btn-primary" onClick={onUpgrade ?? (() => go("settings"))}>
        <Crown className="h-4 w-4" />
        {t("license.getPro")}
      </button>
    </Card>
  );
}
