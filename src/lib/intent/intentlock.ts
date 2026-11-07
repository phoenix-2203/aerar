// IntentLock: does this purchase serve the task it is charged to?
//
// A budget check answers "can the agent afford it". IntentLock answers "is this what the money was given for". It is
// deterministic and explainable on purpose: no model decides money. The task's mandate names the categories it may
// buy (derived from its purpose when the task is created, then signed into the mandate). Each purchase is classified
// from the item itself (its URL and the provider's own description in the 402 quote), never from the agent's stated
// reason, because the agent is the party that may have been talked into it.
//
//   item categories ∩ task categories ≠ ∅   -> INTENT_MATCH
//   item has categories, none of the task's -> INTENT_MISMATCH  (declined; a person can't approve it, only widen the mandate)
//   item can't be classified                -> INTENT_UNCERTAIN (held for a person, or declined if the mandate says so)
//   task has no categories                  -> IntentLock is off for that task (older mandates)
//
// Disguises: before classifying, Reveal (./reveal.ts) undoes Morse, base64, hex, percent-encoding, look-alike letters,
// leetspeak and spaced letters. Words that only appear once decoded mean the item was hidden on purpose: if they point
// outside the mandate the purchase is refused, otherwise it waits for a person. And when the URL and the shop's own
// description name different things, the purchase waits for a person too.
//
// Limits, stated plainly: classification is keyword based. A provider that mislabels its own item can fool it, which
// is why allowlists, the shopping list, price memory and approvals still run alongside it, and why the mandate can
// say "refuse anything uncertain".

import { reveal } from "./reveal";

export interface Category {
  id: string;
  label: string;
  /** Lower-case words or hyphen/space phrases. A phrase matches as consecutive words. */
  terms: string[];
}

export const CATEGORIES: Category[] = [
  {
    id: "market_data",
    label: "Market & FX data",
    terms: ["fx", "forex", "exchange rate", "exchange rates", "interest rate", "interest rates", "rates", "prices", "price feed", "ticker", "tickers", "stocks", "equities", "bonds", "yields", "commodities", "market data", "marketdata", "ohlc", "candles"],
  },
  {
    id: "research_reports",
    label: "Research & reports",
    terms: ["report", "reports", "research", "analysis", "memo", "brief", "summary", "sector", "industry", "outlook", "whitepaper", "study", "market report", "deep report"],
  },
  {
    id: "business_leads",
    label: "Companies & competitors",
    terms: ["competitor", "competitors", "companies", "company", "leads", "prospects", "firmographics", "firmographic", "startups", "funding rounds"],
  },
  {
    id: "blockchain_analytics",
    label: "Blockchain analytics",
    terms: ["ethereum", "eth", "onchain", "on chain", "blockchain", "transactions", "transaction", "tx", "txs", "wallet activity", "defi", "gas", "mempool", "token transfers", "smart contract", "smart contracts", "block", "blocks", "l2", "rollup", "bitcoin", "solana"],
  },
  {
    id: "news",
    label: "News & media",
    terms: ["news", "headlines", "articles", "press", "media monitoring"],
  },
  {
    id: "weather_geo",
    label: "Weather & maps",
    terms: ["weather", "forecast", "climate", "geocode", "geocoding", "maps", "routing"],
  },
  {
    id: "ai_compute",
    label: "AI & compute",
    terms: ["inference", "llm", "completion", "completions", "embeddings", "embedding", "image generation", "gpu", "transcription", "ocr"],
  },
  {
    id: "datasets",
    label: "Bulk datasets",
    terms: ["dataset", "datasets", "full dataset", "bulk", "dump", "export", "archive", "scrape"],
  },
  // Things an agent with a research job almost never needs, and that scams steer agents towards. Never inferred from
  // a task's purpose; a mandate has to name them on purpose.
  {
    id: "gift_cards_gambling",
    label: "Gift cards, gambling & giveaways",
    terms: ["gift card", "gift cards", "giftcard", "giftcards", "voucher", "vouchers", "casino", "betting", "lottery", "giveaway", "airdrop claim", "nft mint", "mint pass", "top up", "topup", "prepaid"],
  },
  {
    id: "personal_data",
    label: "Personal data",
    terms: ["payroll", "ssn", "people search", "personal data", "identity", "passport", "credentials", "passwords", "leaked", "email list", "phone numbers"],
  },
];

/** Categories a task can only get by naming them explicitly, never from its purpose text. */
const EXPLICIT_ONLY = new Set(["gift_cards_gambling", "personal_data"]);

export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;
export const isCategory = (id: string) => CATEGORIES.some((c) => c.id === id);

/** Lower-case words, splitting on anything that isn't a letter or digit (so "fx-rates" -> fx, rates). */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/%[0-9a-f]{2}/gi, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Categories whose terms appear in the text, with the terms that matched (for the explanation). */
export function classify(text: string): { categories: string[]; matched: Record<string, string[]> } {
  const w = words(text);
  const joined = ` ${w.join(" ")} `;
  const matched: Record<string, string[]> = {};
  for (const c of CATEGORIES) {
    const hits = c.terms.filter((t) => joined.includes(` ${words(t).join(" ")} `));
    if (hits.length) matched[c.id] = hits;
  }
  return { categories: Object.keys(matched), matched };
}

/** What a task's purpose says it may buy. Sensitive categories are never inferred. */
export function categoriesForPurpose(purpose: string): string[] {
  return classify(purpose).categories.filter((c) => !EXPLICIT_ONLY.has(c));
}

/** The text an item is judged by: host, path and query words, plus the provider's own description if it gave one. */
export function itemText(url: string, providerDescription?: string | null): string {
  let parts = url;
  try {
    const u = new URL(url);
    // The host's first label is usually a generic word ("api", "pay"); keep the rest, the path and query values.
    parts = `${u.host.split(".").slice(0, -1).join(" ")} ${u.pathname} ${[...u.searchParams.values()].join(" ")}`;
  } catch {
    /* not a URL: judge the raw text */
  }
  return `${parts} ${providerDescription ?? ""}`;
}

/** The provider's own words about the item, from an x402 payment request (v2 `resource.description`, v1 `accepts[].description`). */
export function quoteDescription(raw: unknown): string | null {
  const r = raw as { resource?: { description?: unknown }; description?: unknown; accepts?: { description?: unknown }[] } | null;
  const d = r?.resource?.description ?? r?.description ?? r?.accepts?.find((a) => typeof a?.description === "string")?.description;
  return typeof d === "string" && d.trim() ? d.trim().slice(0, 300) : null;
}

export type IntentOutcome = "match" | "mismatch" | "uncertain" | "off";

export interface IntentResult {
  outcome: IntentOutcome;
  /** INTENT_MATCH | INTENT_MISMATCH | INTENT_UNCERTAIN | null when off. */
  code: string | null;
  taskCategories: string[];
  itemCategories: string[];
  /** Terms in the item that led to its categories. */
  evidence: Record<string, string[]>;
  /** Where the item's description came from. */
  described: "provider" | "url-only";
  /** Ways the item was disguised (Morse, base64, look-alike letters...), empty when it wasn't. */
  disguises: string[];
  /** One sentence a person can act on. */
  explanation: string;
}

export interface IntentInput {
  /** Signed into the mandate. Empty or absent = IntentLock off for this task. */
  taskCategories?: string[];
  url: string;
  providerDescription?: string | null;
}

export function evaluateIntent(input: IntentInput): IntentResult {
  const taskCategories = (input.taskCategories ?? []).filter(isCategory);
  const text = itemText(input.url, input.providerDescription);
  const plain = classify(text);
  // What the item says once its disguises are undone. Categories that only appear there were hidden on purpose.
  const rv = reveal(text);
  const hidden = rv.texts.length ? classify(rv.texts.join(" \n ")) : { categories: [], matched: {} as Record<string, string[]> };
  const hiddenOnly = hidden.categories.filter((c) => !plain.categories.includes(c));
  const disguises = hiddenOnly.length ? rv.disguises : [];
  const itemCategories = [...new Set([...plain.categories, ...hidden.categories])];
  const matched: Record<string, string[]> = { ...plain.matched };
  for (const [c, t] of Object.entries(hidden.matched)) matched[c] = [...new Set([...(matched[c] ?? []), ...t.map((x) => (plain.matched[c]?.includes(x) ? x : `${x} (hidden)`))])];
  const described = input.providerDescription ? "provider" : "url-only";
  const base = { taskCategories, itemCategories, evidence: matched, described, disguises } as const;
  const list = (ids: string[]) => ids.map(categoryLabel).join(", ");
  const how = disguises.join(", ");
  if (!taskCategories.length)
    return { ...base, outcome: "off", code: null, explanation: "This task's mandate names no categories, so IntentLock doesn't check purpose." };
  if (!itemCategories.length)
    return {
      ...base,
      outcome: "uncertain",
      code: "INTENT_UNCERTAIN",
      explanation: `Aerar can't tell what this item is from its address${input.providerDescription ? " or the provider's description" : ""}, so it can't confirm it serves this task (${list(taskCategories)}).`,
    };
  // A sensitive category the mandate didn't name vetoes the match, so "gift card market report" can't sneak through.
  const vetoed = itemCategories.filter((c) => EXPLICIT_ONLY.has(c) && !taskCategories.includes(c));
  const overlap = itemCategories.filter((c) => taskCategories.includes(c));
  if (disguises.length && (vetoed.length || !overlap.length))
    return {
      ...base,
      outcome: "mismatch",
      code: "INTENT_MISMATCH",
      explanation: `The item is disguised (${how}); decoded, it's ${list(vetoed.length ? vetoed : hiddenOnly)}, which this task's mandate doesn't allow; only ${list(taskCategories)}.`,
    };
  if (vetoed.length)
    return {
      ...base,
      outcome: "mismatch",
      code: "INTENT_MISMATCH",
      explanation: `The item looks like ${list(vetoed)}, which this task's mandate doesn't allow; only ${list(taskCategories)}.`,
    };
  if (disguises.length)
    return {
      ...base,
      outcome: "uncertain",
      code: "INTENT_UNCERTAIN",
      explanation: `Part of the item is disguised (${how}) and decodes to ${list(hiddenOnly)}. Honest shops don't hide what they sell, so a person decides.`,
    };
  // The address and the shop's own description should agree on what the item is.
  if (input.providerDescription) {
    const fromUrl = classify(itemText(input.url)).categories;
    const fromShop = classify(input.providerDescription).categories;
    if (fromUrl.length && fromShop.length && !fromUrl.some((c) => fromShop.includes(c)))
      return {
        ...base,
        outcome: "uncertain",
        code: "INTENT_UNCERTAIN",
        explanation: `The address says ${list(fromUrl)} but the shop describes it as ${list(fromShop)}. Aerar can't tell which is true, so a person decides.`,
      };
  }
  if (overlap.length)
    return { ...base, outcome: "match", code: "INTENT_MATCH", explanation: `The item is ${list(overlap)}, which this task is for.` };
  return {
    ...base,
    outcome: "mismatch",
    code: "INTENT_MISMATCH",
    explanation: `The item looks like ${list(itemCategories)}; this task is only for ${list(taskCategories)}.`,
  };
}
