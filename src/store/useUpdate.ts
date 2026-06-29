import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type Phase = "idle" | "checking" | "available" | "downloading" | "uptodate" | "error";

interface UpdateState {
  phase: Phase;
  version: string | null;
  notes: string | null;
  progress: number; // 0-100
  update: Update | null;
  /** Checks the configured endpoint. `silent` suppresses the "up to date" state. */
  check: (silent?: boolean) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
}

export const useUpdate = create<UpdateState>((set, get) => ({
  phase: "idle",
  version: null,
  notes: null,
  progress: 0,
  update: null,

  check: async (silent = false) => {
    set({ phase: "checking" });
    try {
      const update = await check();
      if (update) {
        set({
          phase: "available",
          version: update.version,
          notes: update.body ?? null,
          update,
        });
      } else {
        set({ phase: silent ? "idle" : "uptodate" });
      }
    } catch {
      // Network error or endpoint not configured yet — fail quietly when silent.
      set({ phase: silent ? "idle" : "error" });
    }
  },

  install: async () => {
    const update = get().update;
    if (!update) return;
    set({ phase: "downloading", progress: 0 });
    try {
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          set({ progress: total ? Math.round((downloaded / total) * 100) : 0 });
        }
      });
      await relaunch();
    } catch {
      set({ phase: "error" });
    }
  },

  dismiss: () => set({ phase: "idle" }),
}));
