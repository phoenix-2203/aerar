// In-memory, per-IP rate limiting for the public (no-login) pages. One app process sits behind Caddy,
// so process memory is the right store; limits reset on restart, which is fine for abuse control.

export interface Limit {
  /** Requests allowed per window. */
  max: number;
  windowMs: number;
}

export interface RateResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the oldest request in the window expires (when blocked). */
  retryAfter: number;
}

const MAX_KEYS = 10_000;

/** Sliding-window limiter: remembers request times per key, forgets them after the window. */
export function createRateLimiter(limit: Limit, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();

  function prune(t: number) {
    if (hits.size < MAX_KEYS) return;
    for (const [k, times] of hits) if (!times.length || times[times.length - 1] <= t - limit.windowMs) hits.delete(k);
    // Still full (a flood of distinct IPs): drop the oldest keys rather than grow without bound.
    for (const k of hits.keys()) {
      if (hits.size < MAX_KEYS) break;
      hits.delete(k);
    }
  }

  return {
    check(key: string): RateResult {
      const t = now();
      prune(t);
      const recent = (hits.get(key) ?? []).filter((x) => x > t - limit.windowMs);
      if (recent.length >= limit.max) {
        hits.set(key, recent);
        return { ok: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((recent[0] + limit.windowMs - t) / 1000)) };
      }
      recent.push(t);
      hits.set(key, recent);
      return { ok: true, remaining: limit.max - recent.length, retryAfter: 0 };
    },
  };
}

/**
 * The client's IP as seen by our own reverse proxy. Caddy replaces any incoming X-Forwarded-For with the real
 * peer address unless trusted_proxies is set, so the rightmost entry is the one our proxy wrote.
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** Caps how many expensive jobs (scenario runs) execute at once across all visitors. */
export function createGate(maxConcurrent: number) {
  let running = 0;
  return {
    async run<T>(job: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
      if (running >= maxConcurrent) return { ok: false };
      running++;
      try {
        return { ok: true, value: await job() };
      } finally {
        running--;
      }
    },
    get running() {
      return running;
    },
  };
}

// Shared limiters for the public pages (one per process).
const g = globalThis as unknown as { __aerarLimits?: ReturnType<typeof makeShared> };
function makeShared() {
  return {
    /** Scenario runs per IP. */
    scenarioRuns: createRateLimiter({ max: 20, windowMs: 10 * 60_000 }),
    /** "Run all" plays every scenario; counted separately so it isn't blocked by single runs. */
    runAll: createRateLimiter({ max: 3, windowMs: 10 * 60_000 }),
    // Runs share one sandbox and take turns; allow a short queue, refuse beyond it.
    scenarioGate: createGate(4),
    /** New try-it sandboxes per IP. */
    trySandboxes: createRateLimiter({ max: 6, windowMs: 60 * 60_000 }),
    /** Purchases, approvals and rule changes in try-it sandboxes, per IP. */
    tryActions: createRateLimiter({ max: 120, windowMs: 10 * 60_000 }),
    /** Page views of the public pages. */
    publicPages: createRateLimiter({ max: 60, windowMs: 60_000 }),
  };
}
export function publicLimits() {
  g.__aerarLimits ??= makeShared();
  return g.__aerarLimits;
}
