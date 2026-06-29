import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { useT } from "../i18n";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export function Sidebar({
  items,
  current,
  onNavigate,
}: {
  items: NavItem[];
  current: string;
  onNavigate: (id: string) => void;
}) {
  const { t } = useT();
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-border-subtle bg-bg-base p-3">
      {items.map((item) => {
        const active = current === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "text-text-primary"
                : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            }`}
          >
            {active && (
              <motion.div
                layoutId="nav-active"
                className="absolute inset-0 rounded-xl bg-bg-elevated border border-border-subtle"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <Icon className="relative h-4 w-4" />
            <span className="relative">{item.label}</span>
          </button>
        );
      })}
      <div className="mt-auto px-3 pt-3 text-[11px] leading-relaxed text-text-muted">
        {t("nav.tagline")}
      </div>
    </nav>
  );
}
