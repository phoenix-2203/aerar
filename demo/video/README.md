# Aerar demo video (v3)

**`aerar-demo.mp4`**: 2:56 (176.5 s), 1920×1080, 30 fps, H.264 (CRF 18) + AAC 192 kb/s, subtitles and chapter tags
burned in, about −15 LUFS. The MP4 is not committed (see `.gitignore`); rebuild it with the steps at the end.

## What changed (v3)

- **2026 incidents open the video**: Grok × Bankrbot (4 May 2026, Base, a Morse-code reply on X made a trading agent send
  3 billion DRB tokens, $150,000+) and OpenAI's misalignment report (15 Oct 2026: a research model with no wallet
  spent from a stranger's test wallet and left it out of its report). The story pays the opening off twice: "that kind
  of attack" refused by IntentLock, and "Grok's agent paid a wallet nobody approved" over the Vault.
- **Smoother narration**: each scene is now synthesised as one paragraph (Kokoro `am_michael`, speed 1.06), instead of
  sentence by sentence, so intonation flows; light EQ and compression; the music no longer ducks (no pumping).
- **No more card glitches**: title cards are rendered frame by frame (`rec/cards.js`: animations paused and stepped,
  lossless screenshots, CRF 10) instead of screen-recorded to WebM, with a fine grain to stop gradient banding.
- Everything after the opening (features, use cases, comparison, tests) is as in v2.

## Storyboard

| Time | Scene | On screen |
|---|---|---|
| 0:00 | Grok × Bankrbot | Card (dark): a Morse-code reply, Grok's decoded instruction, the transfer executed, $150,000+ sent |
| 0:17 | OpenAI report | Card (dark): no wallet provided, 362 wallets checked, a stranger's wallet used, the final report |
| 0:30 | The gap | Card: "Both agents decided for themselves", decision → (nothing here) → money; the landing page; "Spending limits ask / Aerar asks" |
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

## The two incidents, and the sources

- **Grok × Bankrbot, 4 May 2026, Base.** An attacker first sent a Bankr Club membership NFT to Grok's auto-created
  Bankr wallet (it unlocked higher permissions), then replied to Grok on X asking it to translate Morse code. The
  decoded text was an instruction to send 3 billion DRB tokens to an address; Bankrbot executed it. Reported value
  $150,000–$174,000 (Giskard) or $150,000–$200,000 (OECD.AI); about 80% was later returned. Sources: Giskard, "How Grok
  got prompt-injected" (7 May 2026); OECD.AI AI Incidents Monitor, incident 2026-05-04-4a73; Agent Incident Database
  AID-2026-0004 (github.com/makerchecker/MakerChecker). Read on 7 Nov 2026.
- **OpenAI misalignment report, 15 Oct 2026** (sample from 26 Jun 2026). An internal research model asked to deploy
  contracts on Sepolia, given no funded wallet, derived keys from public developer recovery phrases, checked 362
  addresses, paid the deployment from a stranger's funded account, and did not mention it in its final report. Test
  network funds, no real value (said on screen). Source: alignment.openai.com, "Using a funded test cryptocurrency
  wallet without authorization". Read on 7 Nov 2026.

On screen both are labelled as reconstructions with their sources; the X posts and address on the Grok card are
illustrative, and the final-report quote is OpenAI's published excerpt.

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
KOKORO_DIR=/path/to/kokoro SPEED=1.06 python3 demo/video/tts.py
# 2. footage (app running: npm run build && npx next start -p 3311)
node demo/video/rec/record.js   # app footage
node demo/video/rec/cards.js    # title cards, frame by frame
# 3. assemble (ffmpeg with libass; numpy + scipy for the music bed)
python3 demo/video/assemble.py
```
