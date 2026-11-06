import { createHash } from "node:crypto";

export function sha256(s: string | Uint8Array): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * Normalise a request so that trivially different spellings of the same purchase map to one key:
 * lowercase scheme/host, default port dropped, query params sorted, fragment dropped, JSON body canonicalised.
 * This is exact-request matching only. It does not claim two different requests are "the same research".
 */
export function normaliseUrl(raw: string): URL {
  const u = new URL(raw);
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) u.port = "";
  const params = [...u.searchParams.entries()].sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  u.search = "";
  for (const [k, v] of params) u.searchParams.append(k, v.trim());
  return u;
}

export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

export function canonicalBody(body: string | null | undefined): string | null {
  if (body == null || body === "") return null;
  try {
    return canonicalJson(JSON.parse(body));
  } catch {
    return body;
  }
}

export function reuseKey(method: string, url: string, body?: string | null): string {
  const b = canonicalBody(body);
  return sha256([method.toUpperCase(), normaliseUrl(url).toString(), b ? sha256(b) : ""].join("\n"));
}
