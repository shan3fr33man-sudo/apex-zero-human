'use client';

export function TokenBudgetGauge({
  used,
  total,
  size = 96,
}: {
  used: number;
  total: number;
  size?: number;
}) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const color = pct > 95 ? '#FF4444' : pct > 80 ? '#FFB800' : '#00FF88';
  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference * (1 - pct / 100);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="rotate-[-90deg]">
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="#1F1F1F"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-lg font-mono font-bold"
          style={{ color }}
        >
          {pct.toFixed(0)}%
        </span>
        <span className="text-[9px] text-apex-muted font-sans">BUDGET</span>
      </div>
    </div>
  );
}
