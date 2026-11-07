// Payment rail interface. The purchase pipeline only talks to this, so x402 can be swapped or faked in tests.

export interface Quote {
  scheme: string;
  network: string;
  asset: string;
  amount: bigint;
  payTo: string;
  /** Full provider payment-required object, kept as evidence and used to build the payment. */
  raw: unknown;
  /** Set when payTo is an Aerar Escrow that Aerar can judge (checked on-chain): who it pays, and after how long. */
  escrow?: { address: string; shop: string; windowSeconds: number };
}

export interface HttpRequestSpec {
  method: string;
  url: string;
  body: string | null;
  headers?: Record<string, string>;
}

export interface CapturedResponse {
  status: number;
  contentType: string | null;
  body: Uint8Array;
}

export type QuoteResult =
  | { kind: "payment_required"; quotes: Quote[] }
  | { kind: "free"; response: CapturedResponse };

/** A payment held in a shop's AerarEscrow (contracts/src/AerarEscrow.sol) until delivery is judged. */
export interface EscrowHold {
  escrow: string;
  holdId: string;
  /** ISO time after which anyone can release it to the shop. */
  releaseAfter: string;
}

export type RefundResult = { ok: true; txHash: string } | { ok: false; reason: string };

export type PayResult =
  | {
      kind: "settled";
      response: CapturedResponse;
      txHash: string;
      payer: string | null;
      amount: bigint | null;
      /** Set when the shop takes payment through an escrow: the money is held, not yet the shop's. */
      escrow?: EscrowHold;
    }
  /** Provider answered but did not settle (402 again, 4xx/5xx). x402 `withX402` only settles on success. */
  | { kind: "not_settled"; response: CapturedResponse; reason: string }
  /** We don't know: the request may have been settled. Budget must stay reserved until reconciled. */
  | { kind: "unknown"; reason: string };

export interface OnchainCheck {
  ok: boolean;
  checkedAt: string;
  blockNumber?: string;
  from?: string;
  to?: string;
  amount?: string;
  reason?: string;
}

export interface PaymentRail {
  readonly id: string;
  readonly network: string;
  readonly asset: string;
  readonly scheme: string;
  readonly payerAddress: string;
  quote(req: HttpRequestSpec): Promise<QuoteResult>;
  /** Pay exactly `quote` (never anything else the provider offers) and fetch the resource. */
  pay(req: HttpRequestSpec, quote: Quote): Promise<PayResult>;
  verifyOnchain(txHash: string, expect: { payTo: string; amount: bigint }): Promise<OnchainCheck>;
  /** Send an escrowed payment back to the payer (not delivered). `reason` is kept as evidence. */
  refund?(hold: EscrowHold, reason: string): Promise<RefundResult>;
  /** Release an escrowed payment to the shop now (delivered). Best effort: otherwise it releases after the window. */
  confirm?(hold: EscrowHold): Promise<RefundResult>;
}
