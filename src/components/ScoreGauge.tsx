interface ScoreGaugeProps {
  score: number;
  size?: number;
  label?: string;
}

export function scoreTone(score: number) {
  if (score >= 80) return "good" as const;
  if (score >= 50) return "mid" as const;
  return "bad" as const;
}

const strokeFor = {
  good: "var(--score-good)",
  mid: "var(--score-mid)",
  bad: "var(--score-bad)",
};

export function ScoreGauge({ score, size = 200, label }: ScoreGaugeProps) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(score);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={strokeFor[tone]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (c * Math.min(Math.max(score, 0), 100)) / 100}
            style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-semibold tabular-nums tracking-tight"
            style={{ fontSize: size * 0.28, color: strokeFor[tone] }}
          >
            {score}
          </span>
          <span className="text-xs uppercase tracking-widest text-muted-foreground">/ 100</span>
        </div>
      </div>
      {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
    </div>
  );
}
