# Aerar Vault contracts

`src/AerarVault.sol`: a USDC vault owned by one wallet, plus a factory (one Vault per wallet).

- The owner signs **mandates** (one per Aerar task): allowed payees, max per payment, limit per period, expiry.
- Aerar's operator key can only call `authorize(...)`: the Vault checks the mandate, books the spend, and computes the
  exact EIP-3009 `TransferWithAuthorization` digest itself. `isValidSignature` (ERC-1271) approves that digest only, so
  an x402 facilitator can settle exactly what the mandate allowed, through USDC v2.2's `transferWithAuthorization(..., bytes)`.
- The owner can pause, revoke, change the operator, or withdraw at any time. Unused approvals expire within 15 minutes
  and their budget can be released.

`src/AerarEscrow.sol`: refunds for x402 purchases that weren't delivered, for shops that opt in.

- A shop creates its escrow through `AerarEscrowFactory` (shop and judge fixed, delivery window 5 minutes to 7 days) and
  names it as its x402 `payTo`. A facilitator settles to the escrow as usual; `record` attributes the payment using the
  payer's own `TransferWithAuthorization` signature (EOA or ERC-1271, so Vaults work), or settles it itself.
- The judge (Aerar) `confirm`s a delivery, so the shop is paid at once, or `refund`s within the window with a reason
  hash. After the window anyone can `release` to the shop. The shop can always refund. Funds can only go back to the
  payer or on to the shop.

```
forge test        # 28 tests: Vault 15, Escrow 10, Seal 3 against a FiatToken-v2.2-style mock (test/MockUSDC.sol)
```

Not audited. Testnet only. The escrow is not deployed yet.
