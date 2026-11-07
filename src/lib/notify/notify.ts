// Approval requests where people already are: Slack, Discord or Telegram. When a purchase needs a person, Aerar posts
// it to the workspace's channel with Approve / Decline links. Each link is signed, names one purchase, and expires;
// opening it shows the purchase and asks for one more click, so link previews can never approve anything.
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { auditEvents, organisations, purchases, tasks } from "@/db/schema";
import { audit } from "@/lib/audit/log";
import { forecastLine } from "@/lib/forecast/burn";
import { burnOf } from "@/lib/server/queries";
import { explain, reasonKind } from "@/lib/copy/reasons";
import { fmt$ } from "@/lib/money/usdc";
import { publicUrl } from "@/lib/server/http";

type Purchase = typeof purchases.$inferSelect;
export type NotifyKind = "slack" | "discord" | "telegram";
export const LINK_TTL_MS = 24 * 3600_000;

/** Only these hosts, so a pasted URL can't make the server call anything else. */
export function notifyKind(url: string): NotifyKind | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (u.hostname === "hooks.slack.com" && u.pathname.startsWith("/services/")) return "slack";
  if ((u.hostname === "discord.com" || u.hostname === "discordapp.com") && u.pathname.startsWith("/api/webhooks/")) return "discord";
  if (u.hostname === "api.telegram.org" && /^\/bot[^/]+\/sendMessage$/.test(u.pathname) && u.searchParams.get("chat_id")) return "telegram";
  return null;
}

export function maskNotifyUrl(url: string | null): string | null {
  if (!url) return null;
  const k = notifyKind(url);
  return k ? `${k[0].toUpperCase()}${k.slice(1)} · …${url.slice(-6)}` : null;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set");
  return s;
}
const mac = (payload: string) => createHmac("sha256", secret()).update(`approve-link:${payload}`).digest("base64url").slice(0, 32);

/** purchaseId.expiry.mac — names one purchase, valid for a day. */
export function approvalToken(purchaseId: string, now = Date.now()): string {
  const exp = (now + LINK_TTL_MS).toString(36);
  return `${purchaseId}.${exp}.${mac(`${purchaseId}.${exp}`)}`;
}

export function readApprovalToken(token: string, now = Date.now()): { purchaseId: string } | { error: string } {
  const [id, exp, sig] = token.split(".");
  if (!id || !exp || !sig) return { error: "This link is broken." };
  const want = mac(`${id}.${exp}`);
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return { error: "This link isn't valid." };
  if (parseInt(exp, 36) < now) return { error: "This link has expired. Decide in Aerar instead." };
  return { purchaseId: id };
}

function message(p: Purchase, link: string) {
  const amount = p.quoteAmount != null ? fmt$(p.quoteAmount) : "an unknown amount";
  const why = p.reasonCodes.filter((c) => reasonKind(c) === "hold").map(explain).join("; ") || "it's above the auto-approve limit";
  const what = `${p.host}${new URL(p.url).pathname}`;
  return {
    title: `Approve ${amount} to ${p.host}?`,
    lines: [`Your agent wants to buy ${what} for ${amount}.`, `Purpose: ${p.purpose.slice(0, 200)}`, `Waiting because ${why}. Nothing is paid until a person decides.`],
    link,
  };
}

async function post(kind: NotifyKind, url: string, m: { title: string; lines: string[]; link: string }) {
  let body: unknown;
  let target = url;
  if (kind === "slack")
    body = {
      text: m.title,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*${m.title}*\n${m.lines.join("\n")}` } },
        { type: "actions", elements: [{ type: "button", style: "primary", text: { type: "plain_text", text: "Review and decide" }, url: m.link }] },
      ],
    };
  else if (kind === "discord")
    body = { username: "Aerar", embeds: [{ title: m.title, description: `${m.lines.join("\n")}\n\n**[Review and decide →](${m.link})**`, color: 0xd8aa55 }] };
  else {
    const u = new URL(url);
    const chatId = u.searchParams.get("chat_id");
    u.search = "";
    target = u.toString();
    body = { chat_id: chatId, text: `${m.title}\n\n${m.lines.join("\n")}`, reply_markup: { inline_keyboard: [[{ text: "Review and decide", url: m.link }]] } };
  }
  const res = await fetch(target, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000), redirect: "error" });
  if (!res.ok) throw new Error(`The channel answered ${res.status}`);
}

async function urlFor(db: Db, orgId: string): Promise<string | null> {
  const [o] = await db.select({ notifyUrl: organisations.notifyUrl }).from(organisations).where(eq(organisations.id, orgId));
  const url = o?.notifyUrl ?? (orgId === (process.env.AERAR_ORG_ID || "org_demo") ? process.env.AERAR_NOTIFY_URL ?? null : null);
  return url && notifyKind(url) ? url : null;
}

/** Post an approval request for a purchase that is waiting for a person. Never throws: a chat outage can't block buying. */
export async function notifyApproval(db: Db, p: Purchase): Promise<void> {
  try {
    const url = await urlFor(db, p.orgId);
    if (!url) return;
    await post(notifyKind(url)!, url, message(p, `${publicUrl()}/approve/${approvalToken(p.id)}`));
  } catch (e) {
    console.warn(`[notify] approval request for ${p.id} not delivered: ${(e as Error).message}`);
  }
}

/** For the "Send a test" button. Throws with a readable reason. */
export async function sendTest(url: string): Promise<void> {
  const kind = notifyKind(url);
  if (!kind) throw new Error("Paste a Slack or Discord webhook URL, or a Telegram sendMessage URL with chat_id.");
  await post(kind, url, { title: "Aerar is connected", lines: ["Approval requests for this workspace will appear here, with a link to approve or decline."], link: `${publicUrl()}/verify` });
}

/**
 * Budget warning: once a task has used 80% of its budget, tell the channel once, with the burn forecast, before it
 * runs out in the middle of the night. Never throws.
 */
export async function notifyBudget(db: Db, taskId: string): Promise<void> {
  try {
    const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!t || t.budget <= 0n || (t.spent + t.reserved) * 100n < t.budget * 80n) return;
    const url = await urlFor(db, t.orgId);
    // Claim the warning under the task's row lock, so two purchases settling together can't both send it.
    const first = await db.transaction(async (tx) => {
      const x = tx as unknown as Db;
      await x.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, t.id)).for("update");
      const [already] = await x.select({ seq: auditEvents.seq }).from(auditEvents).where(and(eq(auditEvents.subjectId, t.id), eq(auditEvents.kind, "budget.alerted"))).limit(1);
      if (already) return false;
      await audit(x, { orgId: t.orgId, actor: "system", kind: "budget.alerted", subjectId: t.id, data: { usedPct: Number(((t.spent + t.reserved) * 100n) / t.budget), notified: !!url } });
      return true;
    });
    if (!first || !url) return;
    const ps = await db.select().from(purchases).where(eq(purchases.taskId, t.id));
    const line = forecastLine(burnOf(t, ps), fmt$, new Date());
    await post(notifyKind(url)!, url, {
      title: `"${t.title}" has used ${Number(((t.spent + t.reserved) * 100n) / t.budget)}% of its budget`,
      lines: [`${fmt$(t.spent + t.reserved)} of ${fmt$(t.budget)} used.`, line ?? "", "Raise the budget, pause the task, or let it run out: nothing is paid past the budget either way."].filter(Boolean),
      link: `${publicUrl()}/report`,
    });
  } catch (e) {
    console.warn(`[notify] budget warning for ${taskId} not delivered: ${(e as Error).message}`);
  }
}
