# Competitors and the gaps Aerar takes

Written 7 Nov 2026. Two kinds of evidence, kept apart:

- **Read today**: pages fetched on 7 Nov 2026 (x402.org, paymanai.com, skyfire.xyz).
- **From prior knowledge**: what I knew of the product up to mid-2026, not re-checked today. AP2, Coinbase CDP, Lit
  Vincent, Crossmint and Nevermined pages could not be loaded from this session (web search is off for the org and
  those fetches were refused or timed out). Treat these rows as "to verify".

## The field

| Product | What it is | Spend controls | Where controls live | Gap Aerar fills |
|---|---|---|---|---|
| **x402** (read today) | Open HTTP 402 payment standard; agents pay per request in stablecoins. | None described on the site. | n/a | x402 moves money; it has no budgets, approvals, memory or receipts. Aerar is the controls layer *for* x402. |
| **Payman** (read today) | "Agentic banking" for banks and credit unions; agents act in chat on existing bank rails. | Immutable policy layer, approval step (one-time code), tamper-evident audit trail, kill switch. | Off-chain, inside the bank. | Bank rails, not x402; no per-task budgets or memory described; nothing a user can verify on-chain. |
| **Skyfire** (read today) | Agent identity (KYA) + agentic wallet + "Buy for Me" checkout on cards and USDC. | A "user mandate" (merchant, product, amount) for a tokenized card payment. | Skyfire's network. | No budgets, allowlists, approvals, receipts or on-chain limits described. |
| **Google AP2** (prior knowledge) | Protocol for agent payments with signed "intent" and "cart" mandates. | Mandates as verifiable credentials. | Protocol messages, verified by the parties. | A protocol, not a running control plane: no budgets that add up across agents, no memory, no approvals UI. |
| **Coinbase CDP wallet policies** (prior knowledge) | Server wallets for agents with policy rules (allowlists, value limits). | Per-transaction rules on the wallet. | Coinbase's signing service (custodial infra). | Per-transaction only: no per-task budgets, no "already bought this", no price memory, no approvals in chat, no receipts. |
| **Lit Vincent** (prior knowledge) | Agent wallets governed by user-approved policies, executed by Lit's network. | Policies such as spending limits per app. | Lit's decentralised key network. | Strong custody story, but no procurement layer: no reuse, no approvals in chat, no receipts per purchase. |
| **Crossmint / Nevermined** (prior knowledge) | Agent wallets and checkout / agent-to-agent payments and metering. | Wallet-level controls / pricing plans. | Their platforms. | Built for paying, not for governing what agents buy. |
| **ACAN** (our earlier build, read in this project) | Stellar contract that enforces agent spending on-chain. | On-chain limits. | Soroban contract. | No procurement memory, no x402, no approvals in chat. Aerar now has the on-chain part too (the Vault). |

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

## Still open (good next steps)

- **Morning Seal**: attest each night's ledger root on Base (EAS), so the whole ledger, not just single receipts, is
  provable later.
- **Outcome checks**: a paid response that is empty or malformed counts against the provider and can trigger a dispute
  flow once x402 has escrow (`auth-capture`).
- **Mainnet** and audits.
