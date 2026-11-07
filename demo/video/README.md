# Aerar demo video

**`aerar-demo.mp4`**: 2:49 (169.1 s), 1920×1080, 30 fps, H.264 (CRF 18) + AAC 48 kHz stereo, subtitles burned in,
narration loudness-normalised to about −16 LUFS. ~32 MB. The MP4 is not committed (see `.gitignore`); rebuild it with the
steps at the end.

## The story, and why this one

Three openings were considered: (1) the attack lab's numbers first, (2) a feature tour, (3) a human analogy. The
analogy won: a judge who has never heard of x402 understands "you gave your assistant $10 for Ethereum research and a web
page talked them into an $8 gift card" in five seconds, and that exact attack is a real scenario in Aerar
(`in-budget-off-purpose`), so the opening sets up the flagship demo instead of decorating it. Everything after is one
thread: *can it afford it?* versus *is this what it was asked to buy?*, then how Aerar answers the second question, what
else goes wrong when agents spend (paying twice, untrusted shops, big buys, paid-but-not-delivered), how it is proven, how
it is enforced on-chain, and evidence that it is real.

## Storyboard

| Time | Scene | On screen (all real app footage unless marked card) |
|---|---|---|
| 0:00 | Hook | Card: the assistant, the task, $10, a web page asking for an $8 gift card; "Can they afford it? ✓ / Is it valid? ✓ / Is it what they were hired to buy? ✕" |
| 0:17 | Problem | Landing page with the night ledger running; card: "Spending limits ask: can the agent afford it? Aerar asks: is this what it was asked to buy?" |
| 0:34 | Signed mandate | `/try`: Create my sandbox → the Signed mandate card (purpose, allowed categories, signature valid, sha256) and the purpose editor |
| 0:47 | IntentLock | `/scenarios`: "Within budget, but not what the money was for", run through the real pipeline: gift card declined (INTENT_MISMATCH, the only rule it broke), Ethereum data paid; plain wallet $9.50 vs Aerar $1.50 |
| 1:10 | Live sandbox | Buy FX rates → Paid; same again → Reused, $0; attacker's shop → Declined, never contacted |
| 1:24 | Outcomes | $0.90 report → waits for you → Approve → Paid; a shop that takes the money and sends nothing → Paid, not delivered; Security panel: shop on hold |
| 1:39 | Proof | Evidence dialog (mandate v1 matches its signature, each claim labelled); `/verify`: a real receipt passes all three checks incl. the USDC transfer on Base Sepolia; Try to cheat: $0.50 → $0.05 → NOT VALID |
| 1:56 | Vault | `/vault` (how the Vault works) → card: `forge test` output for AerarVault.sol → landing "Aerar gets hacked": the Vault refuses |
| 2:12 | Tests | `/scenarios` Run all → 36/36; card: 36/36 attacks, 186 app tests, 18 contract tests |
| 2:24 | Close | Card: "How much can it spend?" vs "What is it buying, and did it arrive?"; Builders page SDK tab; end card: today / next / tagline / URLs |

## Narration (as spoken; subtitles are identical except numbers written as digits)

| Time | Line |
|---|---|
| 0:00 | Imagine you hire an assistant to research Ethereum analytics. You give them one task, and ten dollars. Halfway through, a web page tells them the research needs an eight dollar gift card. They can afford it. The payment is valid. But it is not what they were hired to buy. |
| 0:17 | AI agents are now that assistant. They buy data and APIs on their own, a few cents at a time, over x402 on Base. Spending limits ask one question: can the agent afford it? Aerar asks the one that matters: is this what it was asked to buy? |
| 0:34 | Every task in Aerar starts with a mandate that a person signs. The purpose, the budget, the limits, and the kinds of things the agent may buy. Aerar signs it too, so nobody can quietly change the rules later. |
| 0:47 | Here is that gift card attack, run through Aerar's real purchase pipeline. Eight dollars, inside a ten dollar budget, from a marketplace the task trusts. Every spending limit passes. IntentLock refuses it anyway. The item is a gift card, and the mandate is for blockchain analytics. The Ethereum data the task actually needs still gets bought. |
| 1:10 | The same rules run live in the sandbox. A normal purchase is paid. When a second agent asks for the same data, Aerar serves it from memory, for zero. And a shop the task doesn't trust is never even contacted. |
| 1:24 | Big purchases wait for a person, right here, or in Slack. And when a shop takes the money but sends back nothing, Aerar catches it. The purchase is marked paid, but not delivered, and that shop goes on hold, so it can't happen twice. |
| 1:39 | Every purchase leaves evidence: the signed mandate it was decided under, every reason, and the payment. Anyone can check a receipt in their own browser. This one is real. The USDC moved on Base Sepolia. Change a single number, and the check fails. |
| 1:56 | For hard guarantees, Aerar Vault keeps the money in a contract you own on Base. It only pays shops you approved, within per payment and daily limits, and you can pause or revoke it at any time. Even a compromised Aerar can't spend outside those lines. |
| 2:12 | None of this is a mock up. Thirty six real attacks run through the real pipeline in seconds. One hundred and eighty six app tests, and eighteen contract tests, all pass. |
| 2:24 | Most agent payment tools decide how much an agent can spend. Aerar governs what it buys, proves it, and checks that it arrived. Agents plug in through MCP, or a TypeScript SDK. Today it runs on Base Sepolia. Next: a security review, escrow for failed deliveries, and mainnet. Aerar. Every agent purchase, accounted for. |

## Features shown, and how each one is real

| Feature | Shown by | Real? |
|---|---|---|
| IntentLock | Attack-lab scenario `in-budget-off-purpose`, run on camera | Real pipeline, isolated sandbox DB, simulated providers (as the lab says on screen) |
| Signed mandates | Sandbox mandate card; evidence "mandate v1 matches its signature" | Real signature check |
| Procurement memory | Sandbox preset 2 → Reused, $0 | Real |
| Provider allowlist | Sandbox preset 3 → Declined, never contacted | Real |
| Human approval | Sandbox preset 6 → Approve → Paid | Real (simulated shop) |
| Delivery checks / shop on hold | Sandbox preset 8 + Security panel | Real (the shop is simulated to send nothing) |
| Evidence package | Evidence dialog | Real API response |
| Receipt verification | `/verify` with receipt `pur_4xCRpofq8Vqj` | Real receipt and real Base Sepolia transaction, replayed (see limitations) |
| Vault on Base | `/vault` page, Foundry test output, landing "Aerar gets hacked" | Contract tests are real; the landing animation is illustrative |
| SDK / MCP | Builders page | Real (SDK tested in `src/lib/sdk.test.ts`) |

## Tests shown, and how they were verified

- **Attack lab 36/36**: "Run all" pressed on camera against the local production build; it reports 36/36 handled. The
  same run on the live site returned 36/36 earlier today.
- **186 app tests**: `npx vitest run` on this commit, output in `vitest-output.txt` (26 files, 186 passed).
- **18 contract tests**: `forge test` on `contracts/`, output in `forge-test-output.txt`; the card shows those exact
  lines.

## Limitations and simulated parts, stated plainly

- **Recorded on a local production build** of the same commit as aerar.duckdns.org, because the recording machine can't
  reach the live site. The app's own data differs; the live counters on the landing page were hidden for that reason.
- **The receipt scene replays live data.** The receipt (`live/receipt-pur_4xCRpofq8Vqj.json`), Aerar's published signer
  address and Base Sepolia's own `eth_getTransactionReceipt` answer for tx `0x7837…aac8` were fetched from
  aerar.duckdns.org and sepolia.base.org in a real browser, then served to the local page unchanged. The receipt's hash
  was re-checked before use; the checks the page runs on it are the real ones.
- **Sandbox purchases use simulated shops** and simulated transfers ("0xsim…"), as the app says on screen. Real USDC
  payments appear only in the receipt scene.
- **The Vault isn't driven on camera** (it needs a browser wallet). Its enforcement is shown by its contract test suite;
  the "Aerar gets hacked" landing panel is an illustration, labelled as such on the site.
- **Narration is synthetic**: Piper TTS, voice en-US "ryan" (high), generated offline.
- Some idle moments (page loads, cursor travel) are sped up 1.1–1.7×; results are never sped past.

## Production report

- Web search and the live site were unreachable from the build machine, so footage was recorded locally and the live
  receipt data was captured through a real browser and replayed (above).
- Playwright's video ignores device scale, so pages are recorded at 1920×1080 with CSS zoom 1.33 (a 1440 px layout,
  readable at 1080p). A drawn cursor with click ripples is injected because recordings have no pointer.
- The landing ledger pauses on hover; the cursor was kept off it.
- Subtitle timing first came from silence detection and drifted on comma pauses; narration is now synthesised one
  sentence at a time (`tts.py`), so every subtitle is exact.
- Found while preparing the video and fixed in the product: the live "proven on Base" counter was counting simulated
  sandbox payments; it now counts only real transactions.

## Rebuild

```bash
# 1. narration (needs piper-tts and the en-us-ryan-high voice; set PIPER_VOICE to the .onnx path)
python3 demo/video/tts.py
# 2. footage (needs the app running: npm run build && npx next start -p 3311)
node demo/video/rec/record.js
# 3. assemble (ffmpeg with libass)
python3 demo/video/assemble.py
```
