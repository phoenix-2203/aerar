# UI plan

Goal: a judge with no wallet and no login understands Aerar in two minutes. Then a real operator can run it.
Source of truth for colours, type, words, navigation and logo: [design-brief.md](design-brief.md). This is a UI pass. The pipeline, policy engine and payment rail are not changed.

## Where the current UI disagrees with the brief (and what changes)

| Today | Brief | Change |
|---|---|---|
| Lamp-amber accent `#f6b94a` on ink, dark only | Ink and brass; night-blue brand `#2F45B8` / `#8FA2FF`; brass only for the logo and highlights | New token set, light and dark |
| Geist from Google Fonts | Inter + JetBrains Mono | Self-hosted via Fontsource, so the build never fetches Google Fonts |
| Crescent-only logo | Treasury arch + brass crescent, 24px grid, 2px round strokes | New `Logo` SVG, favicon, Open Graph image |
| "Refused", "Rejected", "Waiting" | One verb per outcome: **Paid, Reused, Needs approval, Declined** | All chips, totals, headlines and copy |
| Reason text in three places (`http.ts`, report, policy engine strings) | One plain sentence per reason code | `src/lib/copy/reasons.ts`, used everywhere in the UI |

## Pages

| Route | Who | What |
|---|---|---|
| `/` | Judge | Headline + one line; CTAs "See it stop an attack" → `/scenarios`, "See last night's report" → `/demo`, tertiary "Operator sign in". Plain wallet vs Aerar (the real `runNight()` numbers, computed at build time). The request pipeline as a PurchaseTimeline. MCP snippet with copy. Cited facts with links. Vibeathon 02 footer. |
| `/scenarios` | Judge | Attack lab grouped by problem. Card: one-line threat, Run, result panel (timeline, checks, plain wallet loss vs Aerar spend). "Run all" with progress and a scoreboard. Polite 429/busy states. |
| `/demo` | Judge | Morning report of the seeded demo org, read-only. Banner "Read-only demo · test USDC on Base Sepolia". Approve/Decline shown disabled with a tooltip. Purchase drawer works read-only. |
| `/report` | Operator | Headline sentence; 4 StatTiles (Paid, Saved by reuse, Declined, Needs approval); approvals inbox first; purchases with status and task filters; providers and agents. |
| `?purchase=<id>` on `/report` and `/demo` | Both | Purchase drawer, URL-addressable: PurchaseTimeline, agent's purpose quoted, deciding rule, quoted vs paid vs onchain, payee, tx hash, evidence hash, response preview. |
| `/tasks/[id]` | Operator | BudgetMeter, rules as sentences ("Set by you · agents can't change this"), policy history as a diff, agents with Pause task / Revoke key, purchases table. |
| `/audit` | Operator | "Verify chain" button with intact/broken result; entries with `prev → hash` in mono. |
| `/login` | Operator | One field, clear error, link to `/demo` for visitors. |

## Components (`src/components`)

`AppShell` (top bar, "Base Sepolia (test)" pill, theme toggle, nav with approvals badge; public variant) · `Button` (primary, secondary, ghost, danger, loading) · `StatusChip` (icon + text + colour) · `Money` (tabular, right-aligned, optional "test USDC") · `Hash` (mono, middle-truncated, copy, BaseScan link) · `BudgetMeter` (80% warning, 100% danger) · `StatTile` · `RuleSentence` · `PurchaseTimeline` (access, memory, quote, policy, reserve, pay, onchain check; passed, failed or skipped) · `ApprovalCard` · `EmptyState` · `Skeleton` · `Toast` · `Drawer` · `Logo` · `ThemeToggle`.

Pipeline steps for a purchase are derived from its stored status and reason codes (a pure function in `src/lib/copy/steps.ts`, with tests). Nothing new is stored.

## Server additions (UI support only)

- `POST /api/scenarios/run-all`: plays every scenario in the sandbox and streams one result per line (NDJSON), with its own per-IP limit, so "Run all" isn't blocked by the single-run limit.
- Scenario results include what a plain wallet would have paid (the quoted prices it would have accepted) next to what Aerar paid.
- Server actions for Pause/Resume task and Revoke agent (operator session checked, as the existing actions are).

## Removed

- `src/components/ui.tsx` (split into the components above), the lamp palette, the Geist fonts.
- The "Last night" mock card on the landing page (the numbers weren't from a real run). Replaced by the real plain wallet vs Aerar comparison.
- The old period-pill-only report header (filters replace it).

## Phases

1. Foundations: tokens, fonts, theme, logo/favicon/OG, components, reason copy.
2. Public pages: `/`, `/scenarios` (+ run-all), `/demo`.
3. Operator pages: `/report` + drawer, `/tasks/[id]`, `/audit`, `/login`.
4. Craft: 360–1440px, accessibility, motion, states, metadata.
5. Verify: tests, typecheck, lint, build; screenshots at 375 and 1440 px, light and dark (system Chrome over the DevTools protocol, no new dependency); judge-path walkthrough; changelog below; README screenshots.

## Changelog

*Filled in at the end of phase 5.*
