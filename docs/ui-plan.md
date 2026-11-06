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

**Foundations**
- Ink-and-brass tokens from the brief, light and dark, set before first paint (saved choice, else system, else dark), with a toggle. Every text pair measured: lowest 4.93:1 (light), 6.05:1 (dark). No text uses opacity.
- Inter and JetBrains Mono self-hosted from Fontsource through `next/font/local`; the build never contacts Google Fonts.
- Logo (arch + brass crescent as one path), SVG favicon that follows the tab theme, generated Open Graph card.
- `src/lib/copy/reasons.ts`: one plain sentence and a pass/hold/fail kind for every reason code (tested against the engine and pipeline sources), one verb per outcome. Used by the dashboard, scenarios, agent API and MCP.
- `src/lib/copy/steps.ts`: the seven pipeline steps derived from what a purchase already stores.
- Components: AppShell/PublicShell, Button, StatusChip, Money, Hash, BudgetMeter, StatTile, RuleSentences, PurchaseTimeline, ApprovalCard, EmptyState, Skeleton, Toast, Drawer, Card, CopyButton, ThemeToggle, Logo.

**Public pages (judge path)**
- `/`: one-line promise; "See it stop an attack" / "See last night's report" / "Operator sign in"; an injected purchase stopped at step 1; the same night by a plain wallet vs Aerar, computed by the real pipeline at build time; the seven steps; one-line MCP connect with copy; four cited facts.
- `/scenarios`: attack lab grouped by problem, Run per card, Run all streaming results with a progress bar and a scoreboard (real count), plain wallet vs Aerar amounts per scenario, polite 429/busy messages. New `POST /api/scenarios/run-all` (NDJSON, 3 per IP per 10 min).
- `/demo`: the operator report, read-only, with a banner; approve/decline shown disabled with an explanation; purchase drawer works.

**Operator pages**
- `/report`: one-sentence lead ("Overnight your agents paid …"), four tiles, approvals inbox first, purchases filterable by status and task, URL-addressable purchase drawer, decline reasons, providers, agents, task budget meters.
- `/tasks/[id]`: budget meter with counts, rules as sentences ("Set by you · agents can't change this"), rule history as a diff, Pause/Resume, Revoke key with inline confirmation.
- `/audit`: Verify chain on demand with an intact/broken-at-entry result; entries in the shared words with `prev → hash`.
- `/login`: one field, inline error, links to the demo and attack lab.

**Craft**
- No horizontal scroll at 375 px on any page (checked by the screenshot tool, which names offending elements). Nav fits a phone with short labels.
- Skip link, visible focus, chips always carry text, aria-live on scenario results, scoreboard and toasts, drawer traps focus and closes on Esc, reduced motion respected, 180 ms ease-out only on state changes.
- Loading skeletons, empty states that say what to do next, loading/success/error on every action. Titles and descriptions on every route.

**Found while verifying**
- Scenario runs allocated ~0.5 GB of WebAssembly memory each and crashed the live server: moved to one shared sandbox (a separate Postgres database in production, guarded so it can never be the ledger).
- A real Postgres deadlock when identical purchases race (lock order). Fixed in the pipeline without changing any decision; confirmed 25/25 live.

**Not done**
- Lighthouse scores were not measured (it would need a new tool installed). Pages are server components by default, fonts are preloaded with size-adjusted fallbacks, and the landing page is static.
- The public demo has no purchase waiting for approval right now (the last one was approved), so judges see the inbox's empty state there; the attack lab and screenshots show the full approval flow.
