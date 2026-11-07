# Competitors and the gaps Aerar takes

Written 7 Nov 2026. Two kinds of evidence, kept apart:

- **Read today**: pages fetched on 7 Nov 2026 (x402.org, paymanai.com, skyfire.xyz, ap2-protocol.org, the AP2 GitHub repo,
  nevermined.ai, CDP's x402 overview, base.org/build).
- **From prior knowledge**: what I knew of the product up to mid-2026, not re-checked today. AP2, Coinbase CDP, Lit
  Vincent, Crossmint and Nevermined pages could not be loaded from this session (web search is off for the org and
  those fetches were refused or timed out). Treat these rows as "to verify".

## The field

| Product | What it is | Spend controls | Where controls live | Gap Aerar fills |
|---|---|---|---|---|
| **x402** (read today) | Open HTTP 402 payment standard; agents pay per request in stablecoins. | None described on the site. | n/a | x402 moves money; it has no budgets, approvals, memory or receipts. Aerar is the controls layer *for* x402. |
| **Payman** (read today) | "Agentic banking" for banks and credit unions; agents act in chat on existing bank rails. | Immutable policy layer, approval step (one-time code), tamper-evident audit trail, kill switch. | Off-chain, inside the bank. | Bank rails, not x402; no per-task budgets or memory described; nothing a user can verify on-chain. |
| **Skyfire** (read today) | Agent identity (KYA) + agentic wallet + "Buy for Me" checkout on cards and USDC. | A "user mandate" (merchant, product, amount) for a tokenized card payment. | Skyfire's network. | No budgets, allowlists, approvals, receipts or on-chain limits described. |
| **Google AP2** (read today) | Open protocol: signed Payment and Checkout mandates (an open mandate can carry a budget and allowed instruments), chained into an audit trail. Cards first; SDK samples, not yet on PyPI. | Mandates as verifiable credentials. | Protocol; enforcement left to issuers and networks ("accountability" is an open question on the page). | No per-transaction limits or approval thresholds described; no running control plane, memory or on-chain enforcement. |
| **Nevermined** (read today) | Spend mandates for agents (amount, purchase count, expiry; one-click revoke), card network tokens, an x402 services catalog, per-purchase records. **The closest product to Aerar.** | Mandate caps, revocation. | Nevermined's service ("we enforce it"); card data in a vault. | No allowlist, no approval step, no delegation between agents, no price memory or reuse, nothing enforced on-chain. |
| **Coinbase CDP x402** (read today) | Facilitator, buyer/seller SDKs, "Agentic Accounts" for agents to pay x402. | Not described on the overview. | Facilitator verifies and settles. | No budgets, caps, approvals or receipts described on the overview; Aerar runs on top of it. |
| **Coinbase CDP wallet policies** (prior knowledge) | Server wallets for agents with policy rules (allowlists, value limits). | Per-transaction rules on the wallet. | Coinbase's signing service (custodial infra). | Per-transaction only: no per-task budgets, no "already bought this", no price memory, no approvals in chat, no receipts. |
| **Lit Vincent** (prior knowledge) | Agent wallets governed by user-approved policies, executed by Lit's network. | Policies such as spending limits per app. | Lit's decentralised key network. | Strong custody story, but no procurement layer: no reuse, no approvals in chat, no receipts per purchase. |
| **Crossmint / Nevermined** (prior knowledge) | Agent wallets and checkout / agent-to-agent payments and metering. | Wallet-level controls / pricing plans. | Their platforms. | Built for paying, not for governing what agents buy. |
| **ACAN** (our earlier build, read in this project) | Stellar contract that enforces agent spending on-chain. | On-chain limits. | Soroban contract. | No procurement memory, no x402, no approvals in chat. Aerar now has the on-chain part too (the Vault). |

## Added since (7 Nov 2026)

- **Mercury Agent Controls**: virtual cards for AI agents from a business bank account (seen on mercury.com, reported by Fast Company). Card rails, not x402; not examined further.
- **The gap none of them close: purpose.** Every product above limits *how much*. Aerar's IntentLock checks *what* is bought against the task's signed purpose, signed mandates detect rules changed after authorisation, and delivery checks catch paid-but-undelivered results and put the shop on hold.

## Big problems most of them leave open

1. **"Did we already buy this?"** Every wallet pays again for the same data. → Aerar's procurement memory, across all agents.
2. **"Is this price normal?"** Nobody remembers what an item usually costs, so a provider can quietly raise its price
   or a compromised one can overcharge. → **New: price memory.** An item costing more than 50% above what was last
   paid waits for a person (`PRICE_JUMPED`).
3. **"Which providers can we trust?"** No one scores providers from what actually happened. → **New: provider
   reliability score** from the org's own ledger (delivered vs failed after payment, price surprises, payee swaps),
   in the report and as an MCP tool agents can consult before buying.
4. **"What if the controller itself is hacked?"** Off-chain policy layers fail with their server. → The Aerar Vault:
   limits enforced by a contract the user owns; "Pretend Aerar got hacked" shows it.
5. **"Agents hire agents."** Delegation multiplies spend with no shared budget. → Sub-tasks carved from the parent,
   spend rolls up, pausing the parent stops every hire.
6. **"Prove it to someone else."** Dashboards ask to be trusted. → Signed receipts anyone can check in their browser,
   with a "try to cheat" mode.
7. **"Approve it where I am."** → Slack / Discord / Telegram links; Claude / ChatGPT connector.

## What the pages read today add

- **Nevermined is the one to beat**: spend mandates, revoke, an x402 catalog. Aerar's answers: the mandate lives in a
  contract the user owns (not a service), plus approvals, memory, price memory, provider scores and agents hiring agents.
- **Nobody says what happens when the enforcer is down or hacked.** Aerar fails closed: no Aerar, no payments; a hacked
  Aerar still can't pass the Vault's limits ("Pretend Aerar got hacked").
- **Base is pushing x402 hard** (base.org/build shows 22K+ x402 APIs and 12K+ active agents, unsourced on the page), and
  Coinbase moved Base Account SDK and Base MCP to CDP ("Coinbase Wallet SDK", "Wallet MCP").

## Still open (good next steps)

- **Morning Seal**: attest each night's ledger root on Base (EAS), so the whole ledger, not just single receipts, is
  provable later.
- **Outcome checks**: done (delivery checks, shop on hold). Escrow still needs x402 `auth-capture`.
- **Mainnet** and audits.
