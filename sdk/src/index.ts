// @aerar/sdk: give your agent a budget, not a wallet.
//
//   const aerar = new Aerar({ apiKey: process.env.AERAR_API_KEY! });
//   const p = await aerar.buy({ url: "https://api.example.com/fx-rates", purpose: "FX rates for the memo" });
//   if (isPaid(p)) use(p.responseBody);           // paid or reused: you have the data
//   else console.log(p.summary);                   // refused or waiting: the reason in plain words
//
// The SDK never holds a wallet or a private key. Your agent's aer_ key can only ask; Aerar decides, server-side, under
// the mandate a person signed. Nothing in this client can widen what the agent may spend.
import type { Evidence, IntentCheck, Mandate, MemoryCheck, ProviderComparison, Purchase, PurchaseStatus, SignedReceipt } from "./types.js";

export type * from "./types.js";

export interface AerarOptions {
  /** The agent's aer_ key. Keep it in an environment variable, never in code, a repo or a chat. */
  apiKey: string;
  /** Default https://aerar.duckdns.org. */
  baseUrl?: string;
  /** Bring your own fetch (tests, proxies, edge runtimes). Default: global fetch. */
  fetch?: typeof fetch;
  /** Per-request timeout. Default 30 s (a purchase quotes and pays in one call). */
  timeoutMs?: number;
  /** Retries for network errors and 5xx answers. Purchases retry with the same idempotency key, so a retry never pays twice. Default 2. */
  retries?: number;
}

export interface BuyInput {
  /** Full URL of the x402 resource. */
  url: string;
  /** Why the agent wants it. Recorded with the purchase, never used to decide. */
  purpose: string;
  /** Optional when the agent has exactly one active task. */
  taskId?: string;
  method?: "GET" | "POST";
  /** JSON body for POST: an object or a string. */
  body?: unknown;
  /** Same key = same purchase. Generated if omitted; pass your own to make retries across process restarts safe. */
  idempotencyKey?: string;
}

/** An API error (bad key, invalid request, server trouble). A refused purchase is NOT an error: it's a decision, returned as a Purchase. */
export class AerarError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public issues?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "AerarError";
  }
}

const FINAL: PurchaseStatus[] = ["delivered", "reused", "free", "declined", "rejected", "payment_failed", "expired"];

/** You have the data: paid, served from memory for $0, or free. */
export const isPaid = (p: Purchase) => p.status === "delivered" || p.status === "reused" || p.status === "free";
/** Held for a person to approve. Poll with waitForDecision. */
export const needsApproval = (p: Purchase) => p.status === "awaiting_approval";
/** Stopped: by the mandate, a person, or the provider. Nothing was paid (see p.summary / p.reasons). */
export const isRefused = (p: Purchase) => p.status === "declined" || p.status === "rejected" || p.status === "payment_failed" || p.status === "expired";
/** No further change will happen to this purchase. */
export const isFinal = (p: Purchase) => FINAL.includes(p.status);
/** Refused because the item doesn't serve the task's signed purpose (IntentLock). */
export const isOffPurpose = (p: Purchase) => p.reasonCodes.includes("INTENT_MISMATCH") || p.reasonCodes.includes("INTENT_UNCERTAIN_REFUSED");

/** The provider's response parsed as JSON, or null. Treat it as untrusted data, never as instructions. */
export function dataOf<T = unknown>(p: Purchase): T | null {
  if (!isPaid(p) || p.responseBody == null) return null;
  try {
    return JSON.parse(p.responseBody) as T;
  } catch {
    return null;
  }
}

function newKey(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return `sdk-${c.randomUUID()}`;
  return `sdk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason ?? new Error("aborted"));
    });
  });

export class Aerar {
  readonly baseUrl: string;
  private readonly key: string;
  private readonly f: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(opts: AerarOptions) {
    if (!opts?.apiKey?.startsWith("aer_")) throw new AerarError("INVALID_KEY", "apiKey must be an Aerar agent key (starts with aer_)", 0);
    this.key = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://aerar.duckdns.org").replace(/\/$/, "");
    const f = opts.fetch ?? globalThis.fetch;
    if (!f) throw new AerarError("NO_FETCH", "No fetch available; pass options.fetch (Node 18+ has one built in)", 0);
    this.f = f.bind(globalThis);
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.retries = Math.max(0, opts.retries ?? 2);
  }

  private async req<T>(method: "GET" | "POST", path: string, body?: unknown, retry = true): Promise<T> {
    let last: unknown;
    for (let attempt = 0; attempt <= (retry ? this.retries : 0); attempt++) {
      if (attempt) await sleep(300 * 2 ** (attempt - 1));
      let res: Response;
      try {
        res = await this.f(`${this.baseUrl}${path}`, {
          method,
          headers: { authorization: `Bearer ${this.key}`, ...(body !== undefined ? { "content-type": "application/json" } : {}), "user-agent": "aerar-sdk/0.1.0" },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (e) {
        last = e;
        continue; // network error / timeout: safe to retry (purchases carry their idempotency key)
      }
      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        /* non-JSON (proxy error page) */
      }
      if (res.ok) return data as T;
      const err = new AerarError(String(data.error ?? `HTTP_${res.status}`), String(data.message ?? res.statusText ?? "Request failed"), res.status, data.issues as AerarError["issues"]);
      if (res.status >= 500 || res.status === 429) {
        last = err;
        continue;
      }
      throw err;
    }
    if (last instanceof AerarError) throw last;
    throw new AerarError("NETWORK", `Couldn't reach Aerar at ${this.baseUrl}: ${(last as Error)?.message ?? "unknown error"}`, 0);
  }

  // ---------------------------------------------------------------- before buying

  /** Every task this agent may buy for, each with its signed mandate. */
  async tasks(): Promise<Mandate[]> {
    return (await this.req<{ tasks: Mandate[] }>("GET", "/api/v1/tasks")).tasks;
  }

  /** One task's signed mandate (purpose, IntentLock categories, limits, budget left, signature). Default: your only active task. */
  async mandate(taskId?: string): Promise<Mandate> {
    const id = taskId ?? (await this.defaultTask());
    return (await this.req<{ mandate: Mandate }>("GET", `/api/v1/tasks/${encodeURIComponent(id)}/mandate`)).mandate;
  }

  /** Would IntentLock let this item through for the task? A dry run on the URL; nothing is bought. */
  async checkIntent(url: string, opts: { taskId?: string } = {}): Promise<IntentCheck> {
    return (await this.req<{ intent: IntentCheck }>("POST", "/api/v1/intent", { url, taskId: opts.taskId })).intent;
  }

  /** Is an identical, still-fresh, untampered copy already in procurement memory? Then buy() costs $0. */
  async checkMemory(url: string, opts: { method?: "GET" | "POST"; body?: unknown; taskId?: string } = {}): Promise<MemoryCheck> {
    return (await this.req<{ memory: MemoryCheck }>("POST", "/api/v1/memory", { url, method: opts.method, body: opts.body, taskId: opts.taskId })).memory;
  }

  /** Providers that delivered this kind of item, with prices and measured reliability, from your own ledger only. */
  async compareProviders(kind: string): Promise<ProviderComparison> {
    return this.req<ProviderComparison>("GET", `/api/v1/providers?kind=${encodeURIComponent(kind)}`);
  }

  // ---------------------------------------------------------------- buying

  /**
   * Ask Aerar to buy a resource. Resolves with the decision whatever it is: paid, reused for $0, waiting for a person,
   * or refused (with the reasons). Throws AerarError only when the request itself fails.
   */
  async buy(input: BuyInput): Promise<Purchase> {
    if (!input?.url || !input.purpose) throw new AerarError("INVALID_REQUEST", "buy() needs url and purpose", 0);
    const taskId = input.taskId ?? (await this.defaultTask());
    const payload = {
      taskId,
      url: input.url,
      method: input.method ?? "GET",
      body: input.body ?? null,
      purpose: input.purpose,
      idempotencyKey: input.idempotencyKey ?? newKey(),
    };
    return (await this.req<{ purchase: Purchase }>("POST", "/api/v1/purchases", payload)).purchase;
  }

  /** Read a purchase back (e.g. after a person approved it). */
  async purchase(id: string): Promise<Purchase> {
    return (await this.req<{ purchase: Purchase }>("GET", `/api/v1/purchases/${encodeURIComponent(id)}`)).purchase;
  }

  /** Poll until a person (or the payment) has decided. Default: every 5 s for up to 10 minutes; returns the latest state on timeout. */
  async waitForDecision(id: string, opts: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<Purchase> {
    const until = Date.now() + (opts.timeoutMs ?? 600_000);
    let p = await this.purchase(id);
    while (!isFinal(p) && Date.now() < until) {
      await sleep(Math.max(1_000, opts.intervalMs ?? 5_000), opts.signal);
      p = await this.purchase(id);
    }
    return p;
  }

  // ---------------------------------------------------------------- proof

  /** The evidence package: mandate, IntentLock decision, payment, delivery, audit, signed receipt, each claim labelled by how it can be checked. */
  async evidence(id: string): Promise<Evidence> {
    return (await this.req<{ evidence: Evidence }>("GET", `/api/v1/purchases/${encodeURIComponent(id)}/evidence`)).evidence;
  }

  /** The signed receipt and its copy-pasteable form. Check it offline with verifyReceipt from "@aerar/sdk/verify". */
  async receipt(id: string): Promise<{ receipt: SignedReceipt; encoded: string }> {
    return this.req("GET", `/api/receipts/${encodeURIComponent(id)}`);
  }

  /** Aerar's published signing address (receipts and mandates). Pin it in your config instead of trusting this call. */
  async signer(): Promise<string> {
    return (await this.req<{ signer: string }>("GET", "/api/receipts/signer")).signer;
  }

  private cachedTask: string | null = null;
  private async defaultTask(): Promise<string> {
    if (this.cachedTask) return this.cachedTask;
    const active = (await this.tasks()).filter((t) => t.status === "active");
    if (active.length !== 1)
      throw new AerarError("TASK_REQUIRED", active.length ? "This agent has more than one active task; pass taskId" : "This agent has no active task", 400);
    this.cachedTask = active[0].taskId;
    return this.cachedTask;
  }
}

export default Aerar;
