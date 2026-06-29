import { create } from "zustand";

export type ToastKind = "info" | "success" | "warn" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = ++counter;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    // Auto-dismiss after a readable delay.
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    }, t.kind === "error" ? 8000 : 4500);
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/** Convenience helper for non-component code. */
export const toast = {
  info: (title: string, message?: string) =>
    useToast.getState().push({ kind: "info", title, message }),
  success: (title: string, message?: string) =>
    useToast.getState().push({ kind: "success", title, message }),
  warn: (title: string, message?: string) =>
    useToast.getState().push({ kind: "warn", title, message }),
  error: (title: string, message?: string) =>
    useToast.getState().push({ kind: "error", title, message }),
};
