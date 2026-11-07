// How long an earlier purchase counts as "the same, still fresh" for a task. Shown as a choice in the sandbox and
// Vault rules; stored as the mandate's reuseWindowSeconds. 0 = never reuse: every request is bought again.
export const FRESHNESS = [
  { seconds: 0, label: "Never reuse (buy every time)" },
  { seconds: 60, label: "1 minute" },
  { seconds: 3600, label: "1 hour" },
  { seconds: 86400, label: "1 day" },
] as const;

export const isFreshness = (n: unknown): n is number => FRESHNESS.some((f) => f.seconds === n);

export function freshnessLabel(seconds: number): string {
  return FRESHNESS.find((f) => f.seconds === seconds)?.label ?? (seconds === 0 ? "never" : `${Math.round(seconds / 60)} minutes`);
}
