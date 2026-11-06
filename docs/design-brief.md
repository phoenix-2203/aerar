# Aerar design brief

Research summary that guides the UI redesign. Patterns are drawn from spend-management, fintech and developer products; sources at the end.

## Principles
- A first-time user understands each screen in seconds. One primary action per screen; brand colour only on that action.
- Calm, factual, accountant-like copy. Red and yellow only for problems.
- Money position first (what happened overnight), controls one level down.

## Patterns
1. **One approvals inbox** (Ramp): a "Needs your approval (N)" block at the top of the morning report, count badge in navigation.
2. **Approval card** (Locus, Payman): amount (large, tabular) · provider · task · the agent's reason quoted · the rule that triggered it · **Approve $X** / **Decline**.
3. **Rules as sentences** (Payman, Locus): "Pay automatically up to $0.25 · Ask me above $0.25 · Never pay providers not on the list."
4. **Transaction row** (Stripe, Mercury): status chip | what was bought | task | time | amount (right-aligned, tabular). Expand for tx hash, onchain check, rule applied.
5. **Fixed status chips** (Stripe): Paid = positive, Reused = info, Needs approval = warning, Declined = negative. Icon plus colour.
6. **Headline plus 4 tiles** (Mercury): Paid · Saved by reuse · Declined · Waiting.
7. **Budget meter** (Brex): "$1.20 of $5.00 used · $3.80 left", thin bar, warning at 80%, danger at 100%.
8. **Teaching empty states** (Vercel Geist): headline, 1–2 sentences, one button.
9. **Live demo first** (Mercury): landing primary action "Try it, no wallet needed"; "Sign in" secondary.
10. **Quiet, dense, aligned** (Linear): reduce noise, strong hierarchy.
11. **"Set by you · agents can't change this"** next to rules (Coinbase Agentic Wallets, Skyfire).

## Colour: ink and brass
| Token | Light | Dark |
|---|---|---|
| background | `#F6F6F3` | `#0A0D14` |
| surface | `#FFFFFF` | `#121722` |
| border | `#E3E3DE` | `#252C3B` |
| text | `#15171C` | `#E9EBF1` |
| text secondary | `#5A6070` | `#9AA2B4` |
| brand (night blue) | `#2F45B8` | `#8FA2FF` |
| accent (brass, logo/highlights) | `#8A5E17` | `#D8AA55` |
| success / tint | `#15734A` / `#E6F4EC` | `#4CC08A` / `#10291F` |
| warning / tint | `#9A5800` / `#FBF0DC` | `#EDB14B` / `#2E2410` |
| danger / tint | `#B8322A` / `#FBE8E6` | `#F2796E` / `#331717` |
| info / tint | `#1F5FAE` / `#E7EFFA` | `#6AA6F2` / `#132640` |

All text pairs meet WCAG AA (ratios computed in the research). Borders are decorative only.

## Type
Inter (UI, tabular numerals for amounts), JetBrains Mono (hashes, addresses). Weights 400/500/600. Body 14/20, H1 24/32, stat numbers 28/32.

## Logo
Three records in a ledger, each a step on from the last, on a 24px grid (record 13.2×4.4, gap 1.8, step 3.1). The two older records take the text colour; the newest (top) takes the accent. Wordmark "Aerar" in Inter 600. One-colour version for favicons and partner pages.

## Accent (brand preview)
Two candidate accents, switchable in the header until the final choice: **brass** (`#8A5E17` light / `#D8AA55` dark, default) and **Base Blue** (`#0000FF` light / `#3C8AFF` dark). `?accent=blue` or `?accent=brass` in any URL sets it. The primary button is ink on paper (inverted text colour), so it works with either accent.

## Navigation
Morning report (home) · Approvals (badge) · Tasks · Audit log ("Tamper-proof record of every decision") · Try the demo (sandbox, test USDC). Top bar: network pill "Base Sepolia (test)".

## Words
One verb per outcome everywhere: **Paid**, **Reused** (saved $X), **Needs approval**, **Declined** (never "refused" or "blocked"). Always give the reason after the verb. Buttons say what they do ("Approve $0.50"). Label test money as "test USDC".

## Sources
Ramp transaction reviews · Mercury design breakdown (925 Studios) · Stripe Badge docs · Brex budgets · Linear UI redesign · Vercel Geist empty states and colours · Canva empty states · Locus platform walkthrough · Skyfire features · Coinbase CDP Agentic Wallet FAQ · Payman review (Dupple).
