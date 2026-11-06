// Problem 3: payments and services don't line up (payee swaps, price changes, failed delivery, wrong chain).
import { eq } from "drizzle-orm";
import { tasks } from "@/db/schema";
import { approvePurchase } from "@/lib/purchase/pipeline";
import { resp } from "@/lib/sim";
import { play, usd, type Scenario, type Stage } from "../stage";

const HOST = "https://data.example.com";
const ATTACKER_WALLET = "0x2222222222222222222222222222222222222222";

async function budget(s: Stage) {
  const [t] = await s.db.select().from(tasks).where(eq(tasks.id, s.task.id));
  return t;
}

export const mismatch: Scenario[] = [
  {
    id: "payee-swapped",
    problem: "mismatch",
    title: "A provider's payment address is swapped",
    story:
      "Aerar has paid data.example.com before, always to the same wallet. Tonight its payment request names a different wallet, as happens when a provider is compromised or a proxy rewrites the 402.",
    expected: "Remember each provider's payee and decline when it changes, before any money moves.",
    run: () =>
      play(
        { offers: { "/fx": { amount: 10_000n }, "/rates": { amount: 10_000n, payTo: ATTACKER_WALLET } } },
        async (s, log, check) => {
          log("researcher: buy /fx (first time paying this provider; its wallet is remembered)");
          log(await s.buy("researcher", `${HOST}/fx`));
          log(`researcher: buy /rates, whose 402 now says pay ${ATTACKER_WALLET.slice(0, 10)}…`);
          const p = await s.buy("researcher", `${HOST}/rates`);
          log(p);
          check.that(p.status === "declined" && p.reasonCodes.includes("PAYEE_CHANGED"), "declined: payee changed");
          check.that(s.rail.calls.pay.length === 1, "only the legitimate first purchase was paid");
          return "$0.00 sent to the swapped wallet.";
        },
      ),
  },
  {
    id: "price-raised-after-approval",
    problem: "mismatch",
    title: "The price goes up after a person approved it",
    story:
      "A $0.06 report waits for approval. Before the operator clicks Approve, the provider raises the price to $0.09.",
    expected: "Re-check the live quote at payment time and pay only the exact amount that was approved. Otherwise pay nothing.",
    run: () =>
      play({ offers: { "/big": { amount: 60_000n } } }, async (s, log, check) => {
        log("researcher: buy /big for $0.06 (above the $0.05 approval line)");
        const held = await s.buy("researcher", `${HOST}/big`);
        log(held);
        s.rail.offers["/big"] = { amount: 90_000n };
        log("provider quietly raises the price to $0.09");
        log("operator: Approve");
        const after = await approvePurchase(s.ctx, held.id, "operator");
        log(after);
        check.that(held.status === "awaiting_approval", "first held for approval");
        check.that(after.status === "payment_failed" && after.reasonCodes.includes("QUOTE_CHANGED"), "not paid: quote changed");
        check.that(s.rail.calls.pay.length === 0, "no money moves");
        check.that((await budget(s)).reserved === 0n, "the held budget is released");
        return "$0.00 paid. An approval covers one exact price, never a different one.";
      }),
  },
  {
    id: "provider-fails",
    problem: "mismatch",
    title: "The provider errors instead of delivering",
    story: "The agent pays for a report, but the provider's server crashes and returns an error instead of the data.",
    expected: "Pay only on delivery (x402 settles on success), record the failure and give the reserved budget back.",
    run: () =>
      play(
        {
          offers: { "/report": { amount: 20_000n } },
          payResult: () => ({ kind: "not_settled", response: resp('{"error":"internal"}', 500), reason: "Provider returned 500; payment not settled" }),
        },
        async (s, log, check) => {
          log("researcher: buy /report ($0.02)");
          const p = await s.buy("researcher", `${HOST}/report`, { plainWalletPays: false });
          log(p);
          const t = await budget(s);
          check.that(p.status === "payment_failed", "recorded as not paid");
          check.that(t.spent === 0n && t.reserved === 0n, "budget fully returned");
          check.that(p.responseStatus === 500, "the provider's error is kept as evidence");
          return `$0.00 spent. ${usd(t.budget)} budget still available.`;
        },
      ),
  },
  {
    id: "unknown-outcome",
    problem: "mismatch",
    title: "Nobody knows whether a payment went through",
    story: "The network drops mid-payment. The money may or may not have moved.",
    expected: "Mark it unknown and keep the budget held, so the agent can't spend it again until it's reconciled.",
    run: () =>
      play(
        { offers: { "/report": { amount: 20_000n } }, payResult: () => ({ kind: "unknown", reason: "socket hang up during settlement" }) },
        async (s, log, check) => {
          log("researcher: buy /report ($0.02); connection drops during payment");
          const p = await s.buy("researcher", `${HOST}/report`, { plainWalletPays: false });
          log(p);
          const t = await budget(s);
          check.that(p.status === "unknown", "marked unknown, not paid or failed");
          check.that(t.reserved === 20_000n, "the $0.02 stays held");
          return "$0.02 held, not double-spent. Flagged for reconciliation.";
        },
      ),
  },
  {
    id: "wrong-chain-or-token",
    problem: "mismatch",
    title: "A provider asks to be paid on another chain or in another token",
    story: "One provider quotes Ethereum mainnet; another asks for a token that isn't USDC.",
    expected: "Pay only in USDC on Base (Sepolia in this build); decline anything else.",
    run: () =>
      play(
        {
          offers: {
            "/mainnet": { amount: 10_000n, network: "eip155:1" },
            "/token": { amount: 10_000n, asset: "0x3333333333333333333333333333333333333333" },
          },
        },
        async (s, log, check) => {
          log("researcher: buy /mainnet (quote on Ethereum mainnet)");
          const a = await s.buy("researcher", `${HOST}/mainnet`);
          log(a);
          log("researcher: buy /token (quote in an unknown token)");
          const b = await s.buy("researcher", `${HOST}/token`);
          log(b);
          check.that(a.status === "declined" && a.reasonCodes.includes("NETWORK_NOT_ALLOWED"), "other chain declined");
          check.that(b.status === "declined" && b.reasonCodes.includes("ASSET_NOT_ALLOWED"), "other token declined");
          check.that(s.rail.calls.pay.length === 0, "no money moves");
          return "$0.00 paid outside USDC on Base.";
        },
      ),
  },
];
