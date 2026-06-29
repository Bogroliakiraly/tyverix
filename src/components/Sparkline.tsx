/**
 * A lightweight, dependency-free SVG sparkline. Kept deliberately tiny so the
 * dashboard can render several live charts without a heavy charting library
 * (which would inflate idle memory).
 */
export function Sparkline({
  data,
  width = 240,
  height = 56,
  color = "#5b8cff",
  max = 100,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  max?: number;
}) {
  if (data.length < 2) {
    return <svg width={width} height={height} />;
  }

  const clampMax = max <= 0 ? 1 : max;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - (Math.min(v, clampMax) / clampMax) * height;
    return [x, y] as const;
  });

  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const gradientId = `spark-${color.replace("#", "")}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
