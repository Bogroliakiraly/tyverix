import { useT } from "../i18n";

/** A circular progress gauge used for the headline CPU / RAM / GPU metrics. */
export function Gauge({
  value,
  label,
  sub,
  size = 130,
  available = true,
}: {
  value: number; // 0-100
  label: string;
  sub?: string;
  size?: number;
  available?: boolean;
}) {
  const { t } = useT();
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;

  const color =
    !available
      ? "#3a4150"
      : clamped >= 90
        ? "#ff5c5c"
        : clamped >= 70
          ? "#f5b14c"
          : "#5b8cff";

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#242833"
            strokeWidth={stroke}
            fill="none"
          />
          {available && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.5s" }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {available ? (
            <span className="text-2xl font-semibold tabular-nums">
              {clamped.toFixed(0)}
              <span className="text-base text-text-secondary">%</span>
            </span>
          ) : (
            <span className="text-xs text-text-muted text-center px-2">
              {t("common.notAvailable")}
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 text-center">
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-xs text-text-secondary mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
