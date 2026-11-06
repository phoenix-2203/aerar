// Two kinds of caller:
//  - agents: Authorization: Bearer aer_...  (hash lookup, revocable)
//  - the operator: one password -> a signed, httpOnly, SameSite=Strict session cookie
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import type { Db } from "@/db";
import { PurchaseError } from "@/lib/purchase/pipeline";
import { authenticateAgent } from "@/lib/workspace";

export const SESSION_COOKIE = "aerar_session";
export const SESSION_TTL_SECONDS = 12 * 3600;

export async function requireAgent(db: Db, req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  const agent = await authenticateAgent(db, m?.[1] ?? null);
  if (!agent) throw new PurchaseError("UNAUTHORIZED", "Missing, invalid or revoked agent API key", 401);
  return agent;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new PurchaseError("AUTH_NOT_CONFIGURED", "SESSION_SECRET must be set (32+ characters)", 503);
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(candidate: unknown): boolean {
  const expected = process.env.OPERATOR_PASSWORD;
  if (!expected || expected.length < 8) throw new PurchaseError("AUTH_NOT_CONFIGURED", "OPERATOR_PASSWORD must be set (8+ characters)", 503);
  if (typeof candidate !== "string") return false;
  // Compare HMACs so the comparison is constant-time regardless of length.
  return safeEqual(sign(`pw:${candidate}`), sign(`pw:${expected}`));
}

export function issueSession(now = Date.now()): string {
  const exp = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const payload = `operator.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "operator") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  return safeEqual(parts[2], sign(`${parts[0]}.${parts[1]}`));
}

export function requireOperator(req: NextRequest): string {
  if (!verifySession(req.cookies.get(SESSION_COOKIE)?.value))
    throw new PurchaseError("UNAUTHORIZED", "Operator login required", 401);
  return "operator";
}

// Small in-memory brake on password guessing (per process; good enough for a single-instance demo).
const attempts = new Map<string, { n: number; until: number }>();
export function loginThrottle(ip: string, now = Date.now()) {
  const a = attempts.get(ip);
  if (a && a.until > now && a.n >= 5) throw new PurchaseError("TOO_MANY_ATTEMPTS", "Too many login attempts, try again in a few minutes", 429);
  return {
    fail() {
      const cur = attempts.get(ip);
      attempts.set(ip, { n: (cur && cur.until > now ? cur.n : 0) + 1, until: now + 5 * 60_000 });
    },
    ok() {
      attempts.delete(ip);
    },
  };
}
