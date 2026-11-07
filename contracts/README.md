# Aerar Vault contracts

`src/AerarVault.sol`: a USDC vault owned by one wallet, plus a factory (one Vault per wallet).

- The owner signs **mandates** (one per Aerar task): allowed payees, max per payment, limit per period, expiry.
- Aerar's operator key can only call `authorize(...)`: the Vault checks the mandate, books the spend, and computes the
  exact EIP-3009 `TransferWithAuthorization` digest itself. `isValidSignature` (ERC-1271) approves that digest only, so
  an x402 facilitator can settle exactly what the mandate allowed, through USDC v2.2's `transferWithAuthorization(..., bytes)`.
- The owner can pause, revoke, change the operator, or withdraw at any time. Unused approvals expire within 15 minutes
  and their budget can be released.

```
forge test        # 15 tests against a FiatToken-v2.2-style mock (test/MockUSDC.sol)
```

Not audited. Testnet only.
