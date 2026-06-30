import { create } from "zustand";
import { getLicenseStatus } from "../lib/api";
import type { LicenseStatus } from "../lib/types";

/**
 * Effective Pro status = an active signed key (paid) OR an account trial.
 * The free trial is now account-based: 1 day from the registration date,
 * applied via `setTrialUntil` once a Supabase account is known.
 */
interface LicenseState {
  /** Raw status from the Rust side (paid key only). */
  rawStatus: LicenseStatus | null;
  /** Effective status shown in the UI (reflects the account trial too). */
  status: LicenseStatus | null;
  loaded: boolean;
  isPro: boolean; // active paid key OR active trial
  /** ISO timestamp when the account trial ends, or null. */
  trialUntil: string | null;
  refresh: () => Promise<void>;
  set: (s: LicenseStatus) => void;
  setTrialUntil: (iso: string | null) => void;
}

function derive(raw: LicenseStatus | null, trialUntil: string | null) {
  const keyPro = !!raw?.valid;
  const trialActive =
    !keyPro && !!trialUntil && Date.now() < Date.parse(trialUntil);
  const isPro = keyPro || trialActive;

  let status = raw;
  if (trialActive && trialUntil) {
    const days = Math.max(1, Math.ceil((Date.parse(trialUntil) - Date.now()) / 86400000));
    status = {
      tier: "trial",
      valid: true,
      email: null,
      expires: trialUntil.slice(0, 10),
      days_remaining: null,
      trial_days_remaining: days,
      reason: null,
    };
  }
  return { isPro, status };
}

export const useLicense = create<LicenseState>((set, get) => ({
  rawStatus: null,
  status: null,
  loaded: false,
  isPro: false,
  trialUntil: null,
  refresh: async () => {
    try {
      const raw = await getLicenseStatus();
      const { isPro, status } = derive(raw, get().trialUntil);
      set({ rawStatus: raw, status, isPro, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  set: (raw) => {
    const { isPro, status } = derive(raw, get().trialUntil);
    set({ rawStatus: raw, status, isPro });
  },
  setTrialUntil: (iso) => {
    const { isPro, status } = derive(get().rawStatus, iso);
    set({ trialUntil: iso, status, isPro });
  },
}));
