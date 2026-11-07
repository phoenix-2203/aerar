import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Money is always stored as USDC atomic units (6 decimals) in bigint columns. Never floats.
const usdc = (name: string) => bigint(name, { mode: "bigint" });
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const organisations = pgTable("organisations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Where approval requests are posted (Slack / Discord / Telegram / generic webhook URL). Secret; never shown back in full. */
  notifyUrl: text("notify_url"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export type MemberRole = "owner" | "approver" | "viewer";

/** Teammates of a wallet workspace, by wallet address. The workspace's own wallet is always the owner. */
export const orgMembers = pgTable(
  "org_members",
  {
    orgId: text("org_id").notNull().references(() => organisations.id),
    address: text("address").notNull(), // lowercase 0x…
    role: text("role").$type<MemberRole>().notNull(),
    addedBy: text("added_by").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("org_members_pk").on(t.orgId, t.address), index("org_members_address").on(t.address)],
);

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => organisations.id),
    name: text("name").notNull(),
    description: text("description"),
    // sha256 of the API key; the key itself is shown once and never stored.
    apiKeyHash: text("api_key_hash").notNull(),
    apiKeyPrefix: text("api_key_prefix").notNull(),
    revokedAt: ts("revoked_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agents_key_hash").on(t.apiKeyHash), index("agents_org").on(t.orgId)],
);

export type TaskStatus = "active" | "paused" | "closed";

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => organisations.id),
    title: text("title").notNull(),
    purpose: text("purpose").notNull(),
    expectedDeliverable: text("expected_deliverable"),
    status: text("status").$type<TaskStatus>().notNull().default("active"),
    budget: usdc("budget").notNull(),
    // Running totals, only changed inside the same transaction as the purchase row they relate to.
    reserved: usdc("reserved").notNull().default(sql`0`),
    spent: usdc("spent").notNull().default(sql`0`),
    currentPolicyVersion: integer("current_policy_version").notNull().default(1),
    deadline: ts("deadline"),
    outcomeNote: text("outcome_note"),
    closedAt: ts("closed_at"),
    /** Sub-task: a budget and rules carved out of this parent for a hired agent. Spend counts up the chain. */
    parentTaskId: text("parent_task_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("tasks_org").on(t.orgId), index("tasks_parent").on(t.parentTaskId)],
);

/** Which agents may spend against which task. */
export const taskAgents = pgTable(
  "task_agents",
  {
    taskId: text("task_id").notNull().references(() => tasks.id),
    agentId: text("agent_id").notNull().references(() => agents.id),
  },
  (t) => [uniqueIndex("task_agents_pk").on(t.taskId, t.agentId)],
);

export interface PolicyRules {
  /** Hosts the task may buy from, e.g. "api.example.com". Empty = none allowed. */
  allowedProviders: string[];
  /** Max per single purchase, atomic USDC units as string. */
  maxPerPurchase: string;
  /** Purchases above this need a human. Atomic units as string. "0" = every purchase needs approval. */
  approvalAbove: string;
  /** Max purchases per agent per rolling hour (loop protection). */
  maxPurchasesPerHour: number;
  /** Reuse an earlier identical purchase if it is younger than this. 0 = never reuse. */
  reuseWindowSeconds: number;
  /** Mandate expiry (ISO). After this, every purchase is declined. */
  expiresAt: string | null;
  /**
   * Shopping list: the only items this task may buy, as "host/path" prefixes (e.g. "reports.acme.dev/market-report").
   * Anything else, even from an allowed provider and under every limit, waits for a person. Empty or absent = off.
   */
  allowedItems?: string[];
  /** Hold for a person when an item costs more than this % above what was last paid for it (default 50; 0 = off). */
  priceJumpPct?: number;
  /** Most this task may spend with one provider (host → atomic USDC), across all its purchases. */
  providerCaps?: Record<string, string>;
  /** Wallet workspaces: the payee address each trusted provider is paid at (host → address), mirrored in the Vault. */
  payees?: Record<string, string>;
  /** IntentLock: the kinds of thing this task may buy (see src/lib/intent). Empty or absent = purpose not checked. */
  categories?: string[];
  /** IntentLock: what happens when Aerar can't tell what an item is. Default "hold" (a person decides). */
  ifUncertain?: "hold" | "refuse";
  /** Hosts this task must never buy from, even if a wildcard on the allowed list matches them. */
  blockedProviders?: string[];
  /** Most purchases (paid or waiting) this task may make in total. Absent = no count limit. */
  maxPurchases?: number;
  /** May this task's agents hire other agents with part of its budget? Default true; false stops delegation. */
  delegationAllowed?: boolean;
}

/** The signed form of a task's mandate (see src/lib/mandate). Stored next to the rules it covers. */
export interface MandateDoc {
  v: 1;
  kind: "aerar.task-mandate";
  task: { id: string; org: string; parent: string | null };
  version: number;
  purpose: string;
  budget: string;
  rules: PolicyRules;
  issuedBy: string;
  issuedAt: string;
}

/** What IntentLock concluded for a purchase, kept as evidence. */
export interface IntentRecord {
  outcome: "match" | "mismatch" | "uncertain" | "off";
  taskCategories: string[];
  itemCategories: string[];
  evidence: Record<string, string[]>;
  described: "provider" | "url-only";
  explanation: string;
}

/** Versioned, immutable. A new version is a new row; old purchases keep pointing at the version they ran under. */
export const policies = pgTable(
  "policies",
  {
    taskId: text("task_id").notNull().references(() => tasks.id),
    version: integer("version").notNull(),
    rules: jsonb("rules").$type<PolicyRules>().notNull(),
    changeNote: text("change_note"),
    /** The mandate as signed (purpose, budget, rules, version), its sha256 and Aerar's EIP-191 signature over it. */
    mandate: jsonb("mandate").$type<MandateDoc>(),
    mandateHash: text("mandate_hash"),
    mandateSig: text("mandate_sig"),
    createdBy: text("created_by").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("policies_pk").on(t.taskId, t.version)],
);

/** A seller we have seen. Stats are computed from purchases, not stored as ratings. */
export const providers = pgTable(
  "providers",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => organisations.id),
    host: text("host").notNull(),
    // First payee seen for this host. A later quote with a different payee is flagged.
    knownPayTo: text("known_pay_to"),
    label: text("label"),
    isDemo: boolean("is_demo").notNull().default(false),
    /** Put on hold after taking a payment without delivering. Nothing is bought from it until a person clears it. */
    heldAt: ts("held_at"),
    heldReason: text("held_reason"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("providers_org_host").on(t.orgId, t.host)],
);

export type PurchaseStatus =
  | "declined" // policy said no; nothing reserved, nothing paid
  | "awaiting_approval" // policy needs a human; nothing reserved yet
  | "rejected" // human said no
  | "reserved" // budget held, about to pay
  | "paying" // payment signed and sent; outcome not yet known
  | "delivered" // provider settled payment and returned a 2xx response
  | "disputed" // paid (settled on-chain), but what came back failed the delivery check; never reused
  | "refunded" // paid into a shop's escrow, failed the delivery check, and the money went back to the payer
  | "payment_failed" // provider/facilitator refused; reservation released
  | "unknown" // network error after payment was sent; needs reconciliation, budget stays held
  | "reused" // served from procurement memory, $0
  | "free" // the URL did not ask for payment
  | "expired"; // approval not given in time

export const purchases = pgTable(
  "purchases",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => organisations.id),
    taskId: text("task_id").notNull().references(() => tasks.id),
    agentId: text("agent_id").notNull().references(() => agents.id),
    idempotencyKey: text("idempotency_key").notNull(),
    // What the agent asked for
    method: text("method").notNull(),
    url: text("url").notNull(),
    host: text("host").notNull(),
    requestBodyHash: text("request_body_hash"),
    requestBody: text("request_body"),
    purpose: text("purpose").notNull(),
    reuseKey: text("reuse_key").notNull(),
    // What the provider actually quoted (from its 402 response)
    quoteAmount: usdc("quote_amount"),
    quotePayTo: text("quote_pay_to"),
    quoteAsset: text("quote_asset"),
    quoteNetwork: text("quote_network"),
    quoteScheme: text("quote_scheme"),
    quoteRaw: jsonb("quote_raw"),
    // Decision
    status: text("status").$type<PurchaseStatus>().notNull(),
    policyVersion: integer("policy_version").notNull(),
    /** sha256 of the signed mandate this purchase was decided under. */
    mandateHash: text("mandate_hash"),
    intent: jsonb("intent").$type<IntentRecord>(),
    reasonCodes: jsonb("reason_codes").$type<string[]>().notNull().default([]),
    reservedAmount: usdc("reserved_amount").notNull().default(sql`0`),
    // Payment
    paidAmount: usdc("paid_amount").notNull().default(sql`0`),
    txHash: text("tx_hash"),
    payer: text("payer"),
    onchainVerifiedAt: ts("onchain_verified_at"),
    onchainCheck: jsonb("onchain_check"),
    // Refund (shops that take payment through an AerarEscrow). paidAmount is the net amount after a refund.
    escrow: text("escrow"),
    /** The shop behind the escrow (who it releases to): the provider's identity for the payee check. */
    escrowShop: text("escrow_shop"),
    escrowHoldId: text("escrow_hold_id"),
    refundedAmount: usdc("refunded_amount").notNull().default(sql`0`),
    refundTx: text("refund_tx"),
    refundedAt: ts("refunded_at"),
    // Delivery evidence
    responseStatus: integer("response_status"),
    responseContentType: text("response_content_type"),
    responseHash: text("response_hash"),
    responseBytes: integer("response_bytes"),
    responseBody: text("response_body"),
    reusedFromId: text("reused_from_id"),
    error: text("error"),
    approvedBy: text("approved_by"),
    decidedAt: ts("decided_at"),
    paidAt: ts("paid_at"),
    deliveredAt: ts("delivered_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("purchases_idem").on(t.agentId, t.idempotencyKey),
    index("purchases_task").on(t.taskId),
    index("purchases_reuse").on(t.orgId, t.reuseKey),
    index("purchases_agent_time").on(t.agentId, t.createdAt),
  ],
);

/** Append-only. Each row carries the hash of the previous row so tampering with history is detectable. */
export const auditEvents = pgTable(
  "audit_events",
  {
    seq: integer("seq").primaryKey().generatedAlwaysAsIdentity(),
    orgId: text("org_id").notNull(),
    actor: text("actor").notNull(),
    kind: text("kind").notNull(),
    subjectId: text("subject_id"),
    data: jsonb("data").notNull(),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("audit_org").on(t.orgId, t.seq), index("audit_subject").on(t.subjectId)],
);

/** Morning Seals: the head of a workspace's audit chain, written to Base. */
export const seals = pgTable(
  "seals",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    seq: integer("seq").notNull(),
    head: text("head").notNull(), // hex sha256 of the audit entry at `seq`
    entries: integer("entries").notNull(),
    txHash: text("tx_hash").notNull(),
    contract: text("contract").notNull(),
    sealer: text("sealer").notNull(),
    sealedAt: ts("sealed_at").notNull().defaultNow(),
  },
  (t) => [index("seals_org").on(t.orgId, t.seq)],
);
