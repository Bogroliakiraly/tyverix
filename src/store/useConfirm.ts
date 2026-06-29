import { create } from "zustand";

/**
 * A global, promise-based confirmation dialog. Every potentially impactful
 * action routes through here so the user always sees: what changes, why it
 * helps, the expected benefit and the potential downside before it runs.
 */
export interface ConfirmRequest {
  title: string;
  what: string;
  why: string;
  benefit: string;
  downside: string;
  confirmLabel?: string;
  danger?: boolean;
  /** Offer to create a System Restore point before proceeding. */
  offerRestorePoint?: boolean;
}

interface ConfirmState {
  request: (ConfirmRequest & { resolve: (ok: boolean, restore: boolean) => void }) | null;
  ask: (req: ConfirmRequest) => Promise<{ ok: boolean; restore: boolean }>;
  resolveWith: (ok: boolean, restore: boolean) => void;
}

export const useConfirm = create<ConfirmState>((set, get) => ({
  request: null,
  ask: (req) =>
    new Promise((resolve) => {
      set({
        request: {
          ...req,
          resolve: (ok, restore) => resolve({ ok, restore }),
        },
      });
    }),
  resolveWith: (ok, restore) => {
    const cur = get().request;
    if (cur) cur.resolve(ok, restore);
    set({ request: null });
  },
}));
