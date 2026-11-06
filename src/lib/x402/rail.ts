// Payment rail interface. The purchase pipeline only talks to this, so x402 can be swapped or faked in tests.

export interface Quote {
  scheme: string;
  network: string;
  asset: string;
  amount: bigint;
  payTo: string;
  /** Full provider payment-required object, kept as evidence and used to build the payment. */
  raw: unknown;
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

export type PayResult =
  | {
      kind: "settled";
      response: CapturedResponse;
      txHash: string;
      payer: string | null;
      amount: bigint | null;
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
}
