import { create } from "zustand";

/**
 * Single source of truth for the active page so any component (e.g. a ProGate
 * "Upgrade" button buried inside a feature page) can navigate to Settings
 * without threading a callback through the whole tree.
 */
interface NavState {
  page: string;
  go: (page: string) => void;
}

export const useNav = create<NavState>((set) => ({
  page: "dashboard",
  go: (page) => set({ page }),
}));
