import { useState } from "react";
import { LogIn, UserPlus, LogOut, RefreshCw, Mail, CheckCircle2 } from "lucide-react";
import { Card, SectionTitle, Spinner } from "./ui";
import { useAuth } from "../store/useAuth";
import { useLicense } from "../store/useLicense";
import { isSupabaseConfigured } from "../lib/supabase";
import { activateLicense } from "../lib/api";
import { toast } from "../store/useToast";
import { useT } from "../i18n";

/**
 * Online account card: register / sign in with the same account used on the
 * website, then pull the active subscription's license key and activate it
 * locally. Hidden entirely when Supabase isn't configured — the manual
 * key-paste flow in Settings still covers offline activation.
 */
export function AccountCard() {
  const { t } = useT();
  const auth = useAuth();
  const license = useLicense();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isSupabaseConfigured) return null;

  async function submit() {
    if (!email.trim() || !password) return;
    setBusy(true);
    try {
      if (mode === "signUp") {
        const { needsConfirmation } = await auth.signUp(email, password);
        if (needsConfirmation) {
          toast.success(t("auth.signedUpTitle"), t("auth.signedUpMsg"));
          setMode("signIn");
          return;
        }
      } else {
        await auth.signIn(email, password);
      }
      setPassword("");
      // Right after a successful sign-in, try to apply any active subscription.
      await syncLicense(true);
    } catch (e) {
      toast.error(t("common.error"), String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  async function syncLicense(silent = false) {
    setBusy(true);
    try {
      const row = await auth.fetchActiveLicense();
      if (!row) {
        if (!silent) toast.warn(t("auth.noSubTitle"), t("auth.noSubMsg"));
        return;
      }
      const status = await activateLicense(row.license_key);
      license.set(status);
      toast.success(t("license.activated"));
    } catch (e) {
      if (!silent) toast.error(t("common.error"), String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  if (auth.user) {
    return (
      <Card>
        <SectionTitle title={t("auth.title")} subtitle={t("auth.subtitle")} />
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-good/15 text-good">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-text-secondary">{t("auth.loggedInAs")}</p>
            <p className="font-medium">{auth.user.email}</p>
          </div>
          <button className="btn-outline" onClick={() => syncLicense(false)} disabled={busy}>
            {busy ? <Spinner /> : <><RefreshCw className="h-4 w-4" /> {t("auth.syncLicense")}</>}
          </button>
          <button className="btn-ghost" onClick={() => auth.signOut()} disabled={busy}>
            <LogOut className="h-4 w-4" /> {t("auth.signOut")}
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle title={t("auth.title")} subtitle={t("auth.subtitle")} />
      <div className="mb-3 flex gap-1 rounded-xl border border-border-subtle p-1 text-sm">
        <button
          className={`flex-1 rounded-lg px-3 py-1.5 transition-colors ${
            mode === "signIn" ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-bg-hover"
          }`}
          onClick={() => setMode("signIn")}
        >
          {t("auth.tabSignIn")}
        </button>
        <button
          className={`flex-1 rounded-lg px-3 py-1.5 transition-colors ${
            mode === "signUp" ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-bg-hover"
          }`}
          onClick={() => setMode("signUp")}
        >
          {t("auth.tabSignUp")}
        </button>
      </div>
      <div className="space-y-2">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.email")}
            className="selectable w-full rounded-xl border border-border-subtle bg-bg-base py-2 pl-9 pr-3 text-sm outline-none focus:border-accent"
          />
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("auth.password")}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="selectable w-full rounded-xl border border-border-subtle bg-bg-base px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button className="btn-primary w-full justify-center" onClick={submit} disabled={busy || !email.trim() || !password}>
          {busy ? (
            <Spinner />
          ) : mode === "signUp" ? (
            <><UserPlus className="h-4 w-4" /> {t("auth.signUp")}</>
          ) : (
            <><LogIn className="h-4 w-4" /> {t("auth.signIn")}</>
          )}
        </button>
      </div>
    </Card>
  );
}
