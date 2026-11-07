// Burn forecast: from what a task actually paid recently, when will it run out? Plain arithmetic, no AI.

export interface Burn {
  /** Paid per hour over the window, atomic USDC. */
  perHour: bigint;
  /** When the budget is gone at that rate, or null if nothing is being spent. */
  runsOutAt: Date | null;
  /** Share of the budget already spent or reserved, 0-100. */
  usedPct: number;
}

const WINDOW_MS = 2 * 3600_000;

export function forecast(task: { budget: bigint; spent: bigint; reserved: bigint }, paid: { at: Date; amount: bigint }[], now: Date): Burn {
  const since = now.getTime() - WINDOW_MS;
  const recent = paid.filter((p) => p.at.getTime() >= since && p.amount > 0n);
  const total = recent.reduce((n, p) => n + p.amount, 0n);
  const used = task.spent + task.reserved;
  const usedPct = task.budget > 0n ? Number((used * 100n) / task.budget) : 100;
  if (total === 0n) return { perHour: 0n, runsOutAt: null, usedPct };
  // Rate over the time actually observed (at least 10 minutes, at most the window), so one early burst isn't averaged away.
  const first = Math.min(...recent.map((p) => p.at.getTime()));
  const spanMs = Math.min(WINDOW_MS, Math.max(10 * 60_000, now.getTime() - first));
  const perHour = (total * 3_600_000n) / BigInt(spanMs);
  const left = task.budget - used;
  if (left <= 0n) return { perHour, runsOutAt: now, usedPct };
  const msLeft = Number((left * 3_600_000n) / (perHour || 1n));
  return { perHour, runsOutAt: new Date(now.getTime() + msLeft), usedPct };
}

export const clockUtc = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;

/** A one-line forecast for people: "At $0.30/hour it runs out around 03:40 UTC." */
export function forecastLine(b: Burn, fmt: (n: bigint) => string, now: Date): string | null {
  if (!b.runsOutAt) return null;
  const hours = (b.runsOutAt.getTime() - now.getTime()) / 3600_000;
  if (hours > 72) return `At ${fmt(b.perHour)}/hour, the budget lasts more than three days.`;
  return `At ${fmt(b.perHour)}/hour it runs out around ${clockUtc(b.runsOutAt)}${hours < 24 ? "" : ` on ${b.runsOutAt.toUTCString().slice(0, 11)}`}.`;
}
