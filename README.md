# Aerar

**Every agent purchase, accounted for.**

AI agents can now pay for APIs and data by themselves (x402, USDC on Base). Wallet tools already cap how much an agent can spend. Aerar answers the questions that come after: *which task was this for, was it allowed, did we already buy it, what did we actually get, and can we prove it?*

Agents don't hold a wallet. They ask Aerar to buy a resource for a task. Aerar:

1. **Checks access first**: the agent is assigned to the task, the task is active, and the provider is on the task's list. A disallowed provider is never even contacted.
2. **Checks procurement memory**: if the organisation already bought the identical request recently, it serves that result for $0.
3. **Gets the provider's real price** from its x402 `402` response. The decision uses that quote, never the agent's claim.
4. **Applies the task's versioned policy** (budget, per-purchase limit, approval threshold, hourly rate, expiry, network/token/payee checks). This is plain code. No AI decides anything about money.
5. **Reserves the budget** under a row lock, so parallel agents can't overspend.
6. **Pays exactly the approved quote** in USDC on Base Sepolia, re-quoting first, so a changed price or payee pays nothing.
7. **Keeps evidence**: response hash, transaction hash, an onchain check that the USDC transfer really happened, and a hash-chained audit log.

Built for Vibestarter's Vibeathon 02 ("Night shift"): your agents work overnight, and Aerar is the morning report.

> **Testnet only.** This build settles on Base Sepolia. There is no mainnet mode.

## Quick start

```bash
npm install
cp .env.example .env        # then fill it in (see below)
npm run db:migrate           # embedded PGlite by default; set DATABASE_URL for Postgres
npm run seed                 # demo org, agent (prints its API key ONCE), 5 USDC task
npm run dev
```

The seed puts `DEMO_PROVIDER_HOST` (default `localhost:3000`) on the task's provider list. If `npm run dev` picks another port, set `DEMO_PROVIDER_HOST` to match before seeding. For `http://localhost` purchases, set `AERAR_ALLOW_INSECURE_HTTP=1` (development only).

PGlite is a single-process database: stop `npm run dev` before running `db:migrate` or `seed` against the same folder.

### Environment

See [`.env.example`](.env.example) for the full list. The essentials:

| Variable | What it is |
| --- | --- |
| `PAYER_PRIVATE_KEY` | Base Sepolia wallet Aerar pays from. Fund it with test USDC at [faucet.circle.com](https://faucet.circle.com). Agents never see it. |
| `DEMO_PAYTO_ADDRESS` | Address that receives payments for the demo endpoints |
| `OPERATOR_PASSWORD`, `SESSION_SECRET` | Operator login and cookie signing |
| `DATABASE_URL` | Optional Postgres; otherwise PGlite in `.data/pglite` |

Never commit `.env`, and never paste keys into chats or issues.

## Demo provider (something real to buy)

Two x402-protected endpoints live inside the app. They return **synthetic** market data, labelled as such:

| Endpoint | Price | Why it's there |
| --- | --- | --- |
| `GET /api/demo/report?topic=…` | 0.10 USDC | Auto-approved purchase, then reused for $0 on repeat |
| `GET /api/demo/premium?topic=…` | 0.50 USDC | Above the seeded 0.25 USDC threshold, so it waits for a person |

Payment settles only after a successful response, so bad requests are never charged.

## Agent API

Authenticate with `Authorization: Bearer aer_…`.

```bash
curl -X POST http://localhost:3000/api/v1/purchases \
  -H "Authorization: Bearer $AERAR_AGENT_KEY" -H "Content-Type: application/json" \
  -d '{"taskId":"tsk_…","url":"http://localhost:3000/api/demo/report?topic=AI%20agents",
       "purpose":"Market brief for tonight'"'"'s report","idempotencyKey":"brief-ai-1"}'
```

The response holds the purchase record (money as atomic USDC strings, plus formatted amounts), a plain-language `summary`, `reasons` with explanations, and the provider's response body when delivered. Status `202` means it's waiting for approval. `GET /api/v1/purchases/:id` reads it back.

Same `idempotencyKey` means the same purchase: retries never pay twice, even when they run concurrently.

## Connect an AI agent over MCP

Aerar exposes an MCP server at `/api/mcp` (streamable HTTP), authenticated with the same agent key. Tools:

- `buy_resource(taskId, url, method?, body?, purpose, idempotencyKey)`: buy through Aerar; the result states the decision and reasons in plain words
- `get_purchase(id)`: check a purchase, e.g. after a person approved it

Add it to Claude Code. Keep the key in an environment variable rather than typing it into a chat:

```bash
export AERAR_AGENT_KEY=aer_…        # from `npm run seed`
claude mcp add --transport http aerar http://localhost:3000/api/mcp \
  --header "Authorization: Bearer $AERAR_AGENT_KEY"
```

Then ask Claude something like *"Use Aerar to buy a market report on AI agents for task tsk_… and summarise it."* Provider responses come back fenced and labelled as untrusted data.

## Operator API

Log in with `POST /api/auth/login {"password": "…"}` (sets an httpOnly, SameSite=Strict cookie). Then:

- `GET /api/tasks`, `GET /api/tasks/:id`: budget, reserved, spent, remaining, policy (with history), purchases
- `POST /api/purchases/:id/approve`, `POST /api/purchases/:id/reject`
- `GET /api/audit`, `GET /api/audit/verify`: event log and hash-chain check
- `POST /api/agents/:id/revoke`

Approving re-checks the hard rules under the task's current policy and re-quotes the price. Approval can't override a limit.

## Purchase states

`declined` · `awaiting_approval` · `rejected` · `reserved` · `paying` · `delivered` · `payment_failed` · `unknown` · `reused` · `free` · `expired`

An approved purchase is not a paid purchase, and a paid purchase is not proof that the data was useful. Aerar records each step separately. `unknown` (a network failure after payment was sent) keeps the budget reserved until it is reconciled, rather than guessing.

## Development

```bash
npm test            # Vitest: policy engine, pipeline (race conditions included), routes, MCP
npm run typecheck
npm run lint
```

## Honest limitations

- **Control only covers purchases that go through Aerar.** If an agent also has its own unrestricted wallet, it can bypass Aerar. Aerar holds the only paying key in this design.
- **Procurement memory matches identical requests** (normalised URL, query and JSON body). It does not claim two different requests are "the same research".
- **x402 `exact` payments settle immediately.** No escrow or refunds yet. The x402 SDK ships an `auth-capture` scheme for authorise-then-capture payments; integrating it is the natural next step.
- Demo endpoints return synthetic data.
- Single organisation per deployment; one operator password.
