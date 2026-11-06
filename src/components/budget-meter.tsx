// Budget meter: "$1.20 of $5.00 used · $3.80 left". Warning at 80%, danger at 100%. Spent and held shown separately.
export function BudgetMeter({
  budget,
  spent,
  reserved = 0n,
  formatted,
  compact = false,
}: {
  budget: bigint;
  spent: bigint;
  reserved?: bigint;
  formatted: { budget: string; spent: string; reserved: string; remaining: string };
  compact?: boolean;
}) {
  const used = spent + reserved;
  const pct = (x: bigint) => (budget > 0n ? Math.min(100, Number((x * 10000n) / budget) / 100) : 0);
  const usedPct = pct(used);
  const tone = usedPct >= 100 ? "bg-danger" : usedPct >= 80 ? "bg-warning" : "bg-success";
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="tabular text-sm">
          <span className="font-medium">{formatted.spent}</span> <span className="text-text-2">of {formatted.budget} used</span>
        </span>
        <span className="tabular text-sm text-text-2">{formatted.remaining} left</span>
      </div>
      <div
        className={`mt-2 flex overflow-hidden rounded-full bg-surface-2 ${compact ? "h-1.5" : "h-2"}`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(usedPct)}
        aria-label={`Budget: ${formatted.spent} spent${reserved > 0n ? `, ${formatted.reserved} held` : ""}, ${formatted.remaining} left of ${formatted.budget}`}
      >
        <div className={`${tone} transition-[width] duration-200`} style={{ width: `${pct(spent)}%` }} />
        {reserved > 0n && <div className="bg-warning/60" style={{ width: `${pct(reserved)}%` }} />}
      </div>
      {!compact && reserved > 0n && <p className="mt-1.5 text-xs text-text-2">{formatted.reserved} held for purchases in progress</p>}
    </div>
  );
}
