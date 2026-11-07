"use server";
// Set or test where a workspace's approval requests are posted. Works for the try-it sandbox and wallet workspaces.
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { organisations } from "@/db/schema";
import { getDbOnly } from "@/lib/server/context";
import { clientIp, publicLimits } from "@/lib/server/rate-limit";
import { decodeSession, TRY_COOKIE } from "@/lib/try/sandbox";
import { decodeWalletSession, WALLET_COOKIE } from "@/lib/wallet/session";
import { maskNotifyUrl, notifyKind, sendTest } from "./notify";

async function orgFor(where: "try" | "vault"): Promise<string | null> {
  const c = await cookies();
  if (where === "try") return decodeSession(c.get(TRY_COOKIE)?.value)?.orgId ?? null;
  const s = decodeWalletSession(c.get(WALLET_COOKIE)?.value);
  if (!s) return null;
  // Only owners change where approvals go.
  if (s.role !== "owner") return null;
  return s.orgId;
}

export async function saveNotify(where: "try" | "vault", url: string): Promise<{ error?: string; done?: string; masked?: string | null }> {
  const r = publicLimits().tryActions.check(clientIp(await headers()));
  if (!r.ok) return { error: `Too many clicks. Try again in ${r.retryAfter} seconds.` };
  const orgId = await orgFor(where);
  if (!orgId) return { error: "Only the workspace owner can change this." };
  const clean = url.trim();
  if (clean && !notifyKind(clean)) return { error: "Paste a Slack or Discord webhook URL, or a Telegram sendMessage URL with chat_id." };
  if (clean) {
    try {
      await sendTest(clean);
    } catch (e) {
      return { error: `Couldn't post there: ${(e as Error).message}` };
    }
  }
  await (await getDbOnly()).update(organisations).set({ notifyUrl: clean || null }).where(eq(organisations.id, orgId));
  refresh();
  return { done: clean ? "Connected. We sent a test message." : "Disconnected.", masked: maskNotifyUrl(clean || null) };
}

/** Current channel, masked. */
export async function currentNotify(where: "try" | "vault"): Promise<string | null> {
  const orgId = await orgFor(where);
  if (!orgId) return null;
  const [o] = await (await getDbOnly()).select({ u: organisations.notifyUrl }).from(organisations).where(eq(organisations.id, orgId));
  return maskNotifyUrl(o?.u ?? null);
}

