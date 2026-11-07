# IntentLock, signed mandates and evidence

Budget controls stop an agent spending too much. They don't stop it spending on the wrong thing. An agent researching
Ethereum that is told by a web page to buy an $8 gift card passes every budget check on a $10 task. IntentLock is the
check that says no.

## The mandate

When a task is created, a person states what it is for, and Aerar records the **mandate**:

| Field | Where it lives |
|---|---|
| Task id, workspace, parent task (if a hired agent) | `MandateDoc.task` |
| Purpose (the person's own sentence) | `MandateDoc.purpose` |
| Budget | `MandateDoc.budget` (atomic USDC) |
| Categories it may buy (IntentLock) | `rules.categories` |
| What to do with items Aerar can't place | `rules.ifUncertain`: `hold` (default) or `refuse` |
| Allowed providers / blocked providers | `rules.allowedProviders`, `rules.blockedProviders` |
| Max per purchase, auto-approve line, purchases per hour | `rules.maxPerPurchase`, `rules.approvalAbove`, `rules.maxPurchasesPerHour` |
| Max purchases in total | `rules.maxPurchases` |
| Shopping list, provider caps, price-jump hold | `rules.allowedItems`, `rules.providerCaps`, `rules.priceJumpPct` |
| Reuse / freshness window | `rules.reuseWindowSeconds` (0 = never reuse) |
| May it hire other agents? | `rules.delegationAllowed` (default true) |
| Expiry | `rules.expiresAt` |
| Version, who issued it, when | `MandateDoc.version`, `issuedBy`, `issuedAt` |

Categories are suggested from the purpose sentence and confirmed by the person before signing. Two sensitive
categories (gift cards, gambling and giveaways; personal data) are never inferred: a mandate has to name them on purpose.

## Signing

Every mandate version is canonical JSON, hashed with SHA-256 and signed with Aerar's published key (EIP-191, the same
key that signs receipts; `GET /api/receipts/signer`). The document, hash and signature are stored next to the rules
(`policies.mandate`, `mandate_hash`, `mandate_sig`). Changing the purpose, the budget or any rule creates the next
version, signed; older purchases keep pointing at the version they were decided under.

Before every purchase (and again before an approval goes through) Aerar checks:

- the stored mandate hashes to its recorded hash, and the signature recovers to Aerar's key;
- the live rules, purpose and budget are exactly what was signed;
- the version is the task's current one.

Any mismatch declines the purchase with `MANDATE_INVALID` before a provider is contacted, and keeps declining until a
person signs a new version through Aerar. Every purchase records the `mandate_hash` it was decided under.

What this protects against: rules edited outside Aerar (a hand-edited database row, a buggy writer, anything that
skips the signer). What it doesn't: someone holding the signing key itself (the server) can sign a new version. That
is why each new version is also an append-only audit event, and the audit head is sealed to Base each morning
(Morning Seal), so a quietly re-signed mandate still leaves a trace that can't be rewritten.

Mandates created before this feature are signed once on first use and that is recorded as `mandate.signed`
(`backfill: true`) in the audit log.

## IntentLock

`src/lib/intent/intentlock.ts`. Deterministic, no model, no network.

1. The **item** is classified from its URL (host labels, path and query words) and the provider's own description in
   its x402 `402` response (`resource.description`, or `accepts[].description` in v1). Never from the agent's stated
   reason: the agent is the party that may have been manipulated.
2. The **task's** categories come from its signed mandate.
3. Outcome:
   - item categories overlap the task's → `INTENT_MATCH` (a pass, recorded);
   - item is in categories the task doesn't have → `INTENT_MISMATCH`, **declined**. A person can't approve it, only
     widen the mandate (a new signed version). A sensitive category the mandate didn't name vetoes the match even if
     the provider adds an on-purpose word to its description;
   - item can't be placed → `INTENT_UNCERTAIN`, **held for a person** (or `INTENT_UNCERTAIN_REFUSED` if the mandate
     says `refuse`). Never a silent pass;
   - mandate has no categories → IntentLock is off for that task (older tasks), shown as such.
4. Hard limits always run alongside it. IntentLock can only add a refusal or a hold; it can never approve something a
   limit, an allowlist, the purchase cap, price memory, the payee check or the Vault refuses.

Every purchase stores what IntentLock concluded (`purchases.intent`): outcome, item categories, task categories, the
words that matched, and whether a provider description was available.

**Known limits.** Classification is keyword based and English-only. A provider that mislabels its own item can fool it
(a gift card described as a market report). That's why the sensitive-category veto exists, why the shopping list,
allowlists, price memory and approvals still run, and why a mandate can say "refuse anything uncertain". It doesn't read
the response content. It isn't a semantic judge of "is this the best data for the job".

## Other mandate checks added with it

- `PROVIDER_BLOCKED`: a host on the blocked list is refused even if a wildcard allows it, before it's contacted.
- `PURCHASE_LIMIT_REACHED`: at most N purchases (paid or waiting). Recounted under the task's row lock, so parallel
  requests can't slip past it.
- `DELEGATION_NOT_ALLOWED`: a mandate can forbid hiring agents. Hired agents inherit the parent's categories,
  uncertainty rule, blocked list and purchase cap, and their spend counts up the chain (existing).
- `MEMORY_ALTERED`: before serving a remembered result, Aerar recomputes its SHA-256 and compares it with the hash taken
  at delivery. An altered copy is never served; Aerar buys a fresh one under every rule and writes
  `memory.integrity_failed` to the audit log.

## Already in place, re-checked for this work

- **Replay / duplicate payment:** idempotency keys (unique per agent, safe under concurrent retries: same key and same
  request returns the original purchase, a different request gets `IDEMPOTENCY_CONFLICT`); a purchase row is claimed
  (`reserved → paying`) before paying so it can't be paid twice; EIP-3009 nonces in the Vault.
- **Quote integrity:** the decision is made on the provider's real 402 quote. Just before paying Aerar re-quotes and
  pays only an offer with the same scheme, network, token, payee and amount; otherwise `QUOTE_CHANGED`, nothing paid.
- **Approval binding:** an approval names one purchase id. It goes through only if the current, intact mandate still
  allows it, and only at exactly the quote that was approved. Approval links in Slack/Discord/Telegram are HMAC-signed,
  expire after 24 h and need a click on the page (link previews can't approve).
- **Revocation:** a revoked key stops authenticating at once; pausing a task stops it and every agent it hired;
  Vault owners can pause, revoke a mandate or withdraw on-chain. A transfer that already settled can't be undone.

## Evidence package

`GET /api/v1/purchases/:id/evidence` (agent key, sandbox cookie, wallet workspace or public demo), the "Evidence"
button in the sandbox, and the `get_evidence` MCP tool. One document: request (with the agent's stated reason marked
as never used to decide), the signed mandate it was decided under, every reason in plain words, the IntentLock
decision, quote, approval, payment, delivery hash, audit entries and the signed receipt. Each claim carries its level:

| Level | Meaning |
|---|---|
| Signed | signed with Aerar's published key, checkable offline (mandate, receipt) |
| On Base | checked against Base itself (USDC Transfer event; audit head in a Morning Seal) |
| Aerar records | recomputed from Aerar's own database (delivery hash, audit chain) |
| Simulated | sandbox: no chain to check, said so |
| n/a | nothing to check (a declined purchase paid nothing) |

Receipts now also carry the mandate hash and the IntentLock outcome.

## Security panel

In the sandbox, every purchase Aerar stopped or held, grouped by kind (off-purpose, untrusted shop, payee swap, quote
changed, rules changed outside Aerar, memory altered, limits). Signals appear only when their evidence is met, and say
what that evidence is, e.g. "2 refusals for off-purpose items or untrusted shops by this agent in 60 minutes". No
invented risk scores.

## Try it

- Sandbox (`/try`): "Push an off-purpose buy" (a $0.20 gift card from a trusted marketplace, within budget → refused),
  "Buy marketplace item #7731" (can't place → waits for you). Change the purpose to Ethereum research in "Your rules",
  confirm the suggested categories, sign, and the marketplace's Ethereum analytics item becomes buyable while the
  market data is refused.
- Attack lab (`/scenarios#intent`): within budget but off-purpose, an item Aerar can't place, a hired agent wandering
  off the job, rules edited behind Aerar's back. Plus a poisoned memory entry and a cheap loop stopped by the purchase cap.
- Tests: `src/lib/intent/intentlock.test.ts`, `src/lib/purchase/intentlock.test.ts`, `src/lib/mcp/server.test.ts`.
