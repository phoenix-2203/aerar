# Aerar demo video (v2)

**`aerar-demo.mp4`**: 2:56 (175.9 s), 1920×1080, 30 fps, H.264 (CRF 18) + AAC 192 kb/s, subtitles and chapter tags
burned in, about −15 LUFS. ~39 MB. The MP4 is not committed (see `.gitignore`); rebuild it with the steps at the end.

## What changed from v1

- **A real-world opening.** Two documented incidents where an AI agent sent money it shouldn't have: Freysa (Nov 2024)
  and AIXBT (Mar 2025). The story then pays the opening off twice: a "Freysa-style attack" refused by IntentLock, and
  "Freysa paid a wallet nobody approved" over the Vault.
- **A more natural voice.** Kokoro (82M, offline) voice `am_michael`, chosen by the builder from six samples. v1 used Piper.
- **Every core feature on screen**, each with a chapter tag: signed mandates, IntentLock, procurement memory, trusted
  shops, price memory, wallet-swap guard, human approval, delivery checks with shop hold, evidence and verifiable
  receipts, the Vault, the attack lab, MCP / SDK.
- **Who it's for, and how it's different.** A "sits between your agents and their money" diagram with three use cases,
  and a comparison table against agent wallets with spend limits.
- **Production.** Punch-in zooms on the two key results (IntentLock's refusal, NOT VALID), a generated music bed ducked
  under the voice, impact hits on the two money reveals, dark "night" cards for the incidents and light for Aerar.

## Storyboard

| Time | Scene | On screen |
|---|---|---|
| 0:00 | Freysa | Card (dark): Nov 2024, the rule "never send the money", a stream of rejected attempts, the message that worked (paraphrased), `approveTransfer()` executed, ≈ $47,000 sent |
| 0:20 | AIXBT | Card (dark): Mar 2025, two attacker instructions queued, 55.5 ETH sent |
| 0:32 | The gap | Card: "Both agents did what they were told", decision → (nothing here) → money; the landing page; "Spending limits ask / Aerar asks" |
| 0:48 | What Aerar is | Card: agents → Aerar → x402 shops; research agent, trading bot, coding agent; the six checks |
| 1:00 | Signed mandate | `/try`: create a sandbox, the signed mandate |
| 1:11 | IntentLock | `/scenarios`: the gift-card attack through the real pipeline; zoom on "Declined", Ethereum data paid |
| 1:30 | Memory, trusted shops | Sandbox: paid → reused for $0 → attacker's shop declined, never contacted |
| 1:42 | Price memory, wallet swap | Sandbox: 5x price waits for a person; a new payee wallet is declined |
| 1:53 | Approvals, delivery | Sandbox: $0.90 report approved; a shop that sends nothing → paid, not delivered, on hold; Security panel |
| 2:03 | Evidence, receipts | Evidence dialog; `/verify` with a real receipt; Try to cheat → NOT VALID (zoom) |
| 2:15 | Vault | `/vault`; `forge test` (the unlisted-payee test highlighted); "Aerar gets hacked" on the landing page |
| 2:27 | Comparison | Table: agent wallets with spend limits vs Aerar |
| 2:35 | Tests | Attack lab Run all → 36/36; card: 36/36, 186 app tests, 18 contract tests |
| 2:43 | Close | Builders page (MCP, SDK); end card: today, next, tagline, URLs |

Subtitles with exact times are in `subtitles.json`; the narration text is `narration.json` (written as spoken, for
example "x four oh two"; the subtitles show "x402").

## The two incidents, and how sure we are

From public reporting, summarised from memory. **Web access was blocked from the build machine, so neither was
re-checked here.** Check both against a primary source before submitting:

- **Freysa** (late Nov 2024, Base): a game where an AI agent held a prize pool and was told never to transfer it. After
  hundreds of paid attempts, one message convinced it that its `approveTransfer` function handled *incoming* payments;
  it sent the whole pool, about 13 ETH (≈ $47,000). The game's rules (system prompt forbids sending, tool-call transfer,
  paid on Base) were confirmed from its public repo, `github.com/0xfreysa/agent`. The amount and the winning message
  were not.
- **AIXBT** (Mar 2025): an attacker reached the agent's dashboard and queued two instructions; the agent sent 55.5 ETH
  (≈ $106,000 at the time, shown as "over $100,000").

On screen both are labelled "Reconstruction from public reports"; the rejected Freysa messages and the AIXBT dashboard are
illustrative, and the winning Freysa message is marked "paraphrased".

## Features shown, and how each one is real

| Feature | Shown by | Real? |
|---|---|---|
| Signed mandates | Sandbox mandate card | Real signature check |
| IntentLock | Attack-lab scenario `in-budget-off-purpose`, run on camera | Real pipeline, isolated database, simulated providers (as the lab says) |
| Procurement memory / never pay twice | Sandbox preset 2 → Reused, $0 | Real |
| Trusted shops (allowlist) | Sandbox preset 3 → Declined, never contacted | Real |
| Price memory | Sandbox preset "5x its price" → waits for a person | Real (simulated shop) |
| Wallet-swap guard | Sandbox preset "swaps its wallet" → declined | Real (simulated shop) |
| Human approval | $0.90 report → Approve → Paid | Real (simulated shop) |
| Delivery checks, shop hold | "Takes the money and sends nothing" → paid, not delivered; Security panel | Real (the shop is simulated to send nothing) |
| Evidence and receipts | Evidence dialog; `/verify` with receipt `pur_4xCRpofq8Vqj` | Real receipt and Base Sepolia transfer, replayed (see limitations) |
| Vault on Base | `/vault`, Foundry output, "Aerar gets hacked" | Contract tests real; the landing animation is illustrative |
| MCP / SDK | Builders page | Real (SDK tested in `src/lib/sdk.test.ts`) |

## Tests shown, and how they were verified

- **Attack lab 36/36**: Run all pressed on camera against the local production build; the live site returned 36/36 too.
- **186 app tests**: `npx vitest run`, output in `vitest-output.txt` (26 files, 186 passed).
- **18 contract tests**: `forge test` on `contracts/`, output in `forge-test-output.txt`; the card shows those lines.

## Limitations, stated plainly

- Recorded on a **local production build** of the same code as aerar.duckdns.org (the build machine can't reach the
  live site); the landing page's live counters are hidden because they'd show local numbers.
- The **receipt scene replays live data** (`live/receipt-pur_4xCRpofq8Vqj.json`: the receipt, Aerar's signer and Base
  Sepolia's answer for tx `0x7837…aac8`, captured from the live site in a real browser). The checks run on it are real.
- **Sandbox shops and transfers are simulated**, as the app says on screen.
- **The Vault isn't driven on camera** (it needs a browser wallet); its contract tests are shown instead.
- **Synthetic narration** (Kokoro `am_michael`) and a **generated music bed** (`music.py`, no samples or licensed music).
- Some waits are sped up 1.1–1.8× (cursor travel, page loads, scrolling); results are never sped past.

## Rebuild

```bash
# 1. narration: pip install kokoro-onnx soundfile; model files from github.com/thewh1teagle/kokoro-onnx releases
KOKORO_DIR=/path/to/kokoro SPEED=1.12 python3 demo/video/tts.py
# 2. footage (app running: npm run build && npx next start -p 3311)
node demo/video/rec/record.js
# 3. assemble (ffmpeg with libass; numpy + scipy for the music bed)
python3 demo/video/assemble.py
```
