/**
 * Localized text for entries in the Safety page's change history.
 */
import type { ActionRecord } from "./types";

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

/** Returns the translation for `key`, or `undefined` when none exists. */
function maybe(t: TFn, key: string): string | undefined {
  const v = t(key);
  return v === key ? undefined : v;
}

/**
 * Human name of a startup item from its id ("hr::Steam", "st::\AMD\StartCN",
 * "ux::Microsoft.WindowsTerminal_8wekyb3d8bbwe\StartTerminalOnLoginTask").
 * Mirrors the naming the Startup page itself uses.
 */
function startupName(id: string): string {
  const [code, rest = id] = id.split(/::(.*)/s);
  if (code === "st") return rest.split("\\").filter(Boolean).pop() ?? rest;
  if (code === "ux") {
    const pkg = rest.split("\\")[0].split("_")[0];
    return pkg.split(".").filter(Boolean).pop() ?? pkg;
  }
  return rest;
}

/**
 * The history text, in the UI language.
 *
 * The backend writes each entry's `description` in English at the moment the
 * change is made, and those entries are persisted — so switching the app to
 * Hungarian could never translate them after the fact. Instead the text is
 * rebuilt here from the entry's kind and structured payload. Entries written
 * by older versions lack some payload fields; for those the one missing detail
 * (a plan name, a count) is read out of the stored English description, and
 * anything unrecognised falls back to that description unchanged.
 */
export function describeAction(rec: ActionRecord, t: TFn): string {
  const p = rec.payload ?? {};
  switch (rec.kind) {
    case "startup_toggle": {
      if (typeof p.id !== "string") break;
      // The payload stores what an undo would restore, i.e. the opposite of
      // what this entry did.
      const enabled = p.restore_enabled === false;
      return t(enabled ? "history.startupEnabled" : "history.startupDisabled", {
        name: startupName(p.id),
      });
    }
    case "tweak": {
      if (p.bulk === true) {
        const count =
          typeof p.count === "number"
            ? p.count
            : Number(/\((\d+)\)/.exec(rec.description)?.[1] ?? NaN);
        return Number.isFinite(count)
          ? t("history.tweakRevertAll", { n: count })
          : t("history.tweakRevertAllNoCount");
      }
      if (typeof p.id !== "string") break;
      const name =
        maybe(t, `tweak.${p.id}.name`) ??
        /“(.+)”/.exec(rec.description)?.[1] ??
        p.id;
      const applied = p.restore_enable === false;
      return t(applied ? "history.tweakApplied" : "history.tweakReverted", { name });
    }
    case "power_plan": {
      const name =
        (typeof p.plan_name === "string" ? p.plan_name : undefined) ??
        /^Switched power plan to (.+)$/.exec(rec.description)?.[1];
      if (name) return t("history.powerPlan", { name });
      break;
    }
    case "game_mode":
      return t("history.gameMode");
  }
  return rec.description;
}
