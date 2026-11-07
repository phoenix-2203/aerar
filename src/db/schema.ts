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
  createdAt: ts("created_at").notNull().defaultNow(),
});

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
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("tasks_org").on(t.orgId)],
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
  /** Wallet workspaces: the payee address each trusted provider is paid at (host → address), mirrored in the Vault. */
  payees?: Record<string, string>;
}

/** Versioned, immutable. A new version is a new row; old purchases keep pointing at the version they ran under. */
export const policies = pgTable(
  "policies",
  {
    taskId: text("task_id").notNull().references(() => tasks.id),
    version: integer("version").notNull(),
    rules: jsonb("rules").$type<PolicyRules>().notNull(),
    changeNote: text("change_note"),
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
    reasonCodes: jsonb("reason_codes").$type<string[]>().notNull().default([]),
    reservedAmount: usdc("reserved_amount").notNull().default(sql`0`),
    // Payment
    paidAmount: usdc("paid_amount").notNull().default(sql`0`),
    txHash: text("tx_hash"),
    payer: text("payer"),
    onchainVerifiedAt: ts("onchain_verified_at"),
    onchainCheck: jsonb("onchain_check"),
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
