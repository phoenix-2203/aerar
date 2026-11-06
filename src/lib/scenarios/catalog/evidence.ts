// Problem 4: the numbers can't be trusted (edited history, unverifiable payments, unexplained decisions).
import { and, eq } from "drizzle-orm";
import { auditEvents } from "@/db/schema";
import { verifyChain } from "@/lib/audit/log";
import { updatePolicy } from "@/lib/workspace";
import type { OnchainCheck } from "@/lib/x402/rail";
import { defaultRules } from "@/test/helpers";
import { play, type Scenario } from "../stage";

const HOST = "https://data.example.com";

export const evidence: Scenario[] = [
  {
    id: "history-edited",
    problem: "evidence",
    title: "Someone edits the history to hide a purchase",
    story:
      "After a night of purchases, someone with database access quietly rewrites one record so a $0.04 payment looks like $0.01.",
    expected: "Every record carries the hash of the one before it, so recomputing the chain exposes the edit and where it happened.",
    run: () =>
      play({ offers: { "/a": { amount: 40_000n }, "/b": { amount: 10_000n } } }, async (s, log, check) => {
        log(await s.buy("researcher", `${HOST}/a`));
        log(await s.buy("analyst", `${HOST}/b`));
        const before = await verifyChain(s.db, s.org.id);
        log(`Audit chain checked: ${before.count} records, intact`);
        const [target] = await s.db
          .select()
          .from(auditEvents)
          .where(and(eq(auditEvents.orgId, s.org.id), eq(auditEvents.kind, "purchase.delivered")))
          .limit(1);
        await s.db
          .update(auditEvents)
          .set({ data: { ...(target.data as Record<string, unknown>), paid: "10000" } })
          .where(eq(auditEvents.seq, target.seq));
        log(`Someone rewrites record #${target.seq}: paid $0.04 -> $0.01`);
        const after = await verifyChain(s.db, s.org.id);
        log(after.ok ? "Chain still looks intact (BAD)" : `Audit chain checked: BROKEN at record #${after.brokenAt}`);
        check.that(before.ok, "chain intact before the edit");
        check.that(!after.ok && after.brokenAt === target.seq, "the edit is detected at the exact record");
        return "Tampering detected and pinpointed. History can't be quietly rewritten.";
      }),
  },
  {
    id: "onchain-mismatch",
    problem: "evidence",
    title: "A provider says it was paid, but the chain disagrees",
    story:
      "The provider reports a successful settlement, but the USDC transfer on Base doesn't match: wrong amount or wrong recipient.",
    expected: "Check every payment against the chain itself, and flag any that doesn't match instead of trusting the receipt.",
    run: () =>
      play({ offers: { "/a": { amount: 10_000n } } }, async (s, log, check) => {
        s.rail.verifyOnchain = async () => ({
          ok: false,
          checkedAt: new Date().toISOString(),
          reason: "No USDC transfer of 0.01 to the quoted payee in this transaction",
        });
        const p = await s.buy("researcher", `${HOST}/a`);
        log(p);
        const onchain = p.onchainCheck as OnchainCheck | null;
        log(`Onchain check: ${onchain?.reason}`);
        check.that(p.status === "delivered", "delivery is recorded");
        check.that(p.onchainVerifiedAt === null && onchain?.ok === false, "but the payment is flagged as not verified");
        return "Flagged for review. A receipt is never taken on trust.";
      }),
  },
  {
    id: "which-rule-applied",
    problem: "evidence",
    title: "\"Why was this allowed?\" weeks later",
    story:
      "Midnight: the operator tightens a task's per-purchase limit from $0.10 to $0.03. A month later an auditor asks which rule each purchase was made under.",
    expected: "Rules are versioned and never edited in place; each purchase records the version and every reason that applied.",
    run: () =>
      play({ offers: { "/a": { amount: 20_000n }, "/b": { amount: 20_000n }, "/c": { amount: 50_000n } }, rules: { approvalAbove: "100000" } }, async (s, log, check) => {
        const a = await s.buy("researcher", `${HOST}/a`);
        log(`${a.status === "delivered" ? "Paid $0.02" : a.status} under rules v${a.policyVersion}`);
        await updatePolicy(s.db, s.task.id, defaultRules({ maxPerPurchase: "30000", approvalAbove: "100000" }), "operator", "Tighter limit after midnight");
        log("operator: per-purchase limit lowered to $0.03 (rules v2)");
        const b = await s.buy("researcher", `${HOST}/b`);
        log(`${b.status === "delivered" ? "Paid $0.02" : b.status} under rules v${b.policyVersion}`);
        const c = await s.buy("researcher", `${HOST}/c`);
        log(`Declined $0.05 under rules v${c.policyVersion}: ${c.reasonCodes.join(", ")}`);
        check.that(a.policyVersion === 1 && b.policyVersion === 2 && c.policyVersion === 2, "each purchase records its rules version");
        check.that(c.status === "declined" && c.reasonCodes.includes("OVER_PER_PURCHASE_LIMIT"), "the new limit applies immediately");
        check.that(a.reasonCodes.includes("WITHIN_PER_PURCHASE_LIMIT"), "allowed purchases record why they passed");
        return "Every decision can be explained later: rules version plus reasons, in the hash-chained log.";
      }),
  },
];
