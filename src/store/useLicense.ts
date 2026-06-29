import { create } from "zustand";
import { getLicenseStatus } from "../lib/api";
import type { LicenseStatus } from "../lib/types";

interface LicenseState {
  status: LicenseStatus | null;
  loaded: boolean;
  isPro: boolean; // true for active Pro or trial
  refresh: () => Promise<void>;
  set: (s: LicenseStatus) => void;
}

export const useLicense = create<LicenseState>((set) => ({
  status: null,
  loaded: false,
  isPro: false,
  refresh: async () => {
    try {
      const s = await getLicenseStatus();
      set({ status: s, loaded: true, isPro: s.valid });
    } catch {
      set({ loaded: true });
    }
  },
  set: (s) => set({ status: s, isPro: s.valid }),
}));
