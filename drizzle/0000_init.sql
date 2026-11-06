CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"api_key_hash" text NOT NULL,
	"api_key_prefix" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"seq" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"org_id" text NOT NULL,
	"actor" text NOT NULL,
	"kind" text NOT NULL,
	"subject_id" text,
	"data" jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"task_id" text NOT NULL,
	"version" integer NOT NULL,
	"rules" jsonb NOT NULL,
	"change_note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"host" text NOT NULL,
	"known_pay_to" text,
	"label" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"task_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"method" text NOT NULL,
	"url" text NOT NULL,
	"host" text NOT NULL,
	"request_body_hash" text,
	"request_body" text,
	"purpose" text NOT NULL,
	"reuse_key" text NOT NULL,
	"quote_amount" bigint,
	"quote_pay_to" text,
	"quote_asset" text,
	"quote_network" text,
	"quote_scheme" text,
	"quote_raw" jsonb,
	"status" text NOT NULL,
	"policy_version" integer NOT NULL,
	"reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reserved_amount" bigint DEFAULT 0 NOT NULL,
	"paid_amount" bigint DEFAULT 0 NOT NULL,
	"tx_hash" text,
	"payer" text,
	"onchain_verified_at" timestamp with time zone,
	"onchain_check" jsonb,
	"response_status" integer,
	"response_content_type" text,
	"response_hash" text,
	"response_bytes" integer,
	"response_body" text,
	"reused_from_id" text,
	"error" text,
	"approved_by" text,
	"decided_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_agents" (
	"task_id" text NOT NULL,
	"agent_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"title" text NOT NULL,
	"purpose" text NOT NULL,
	"expected_deliverable" text,
	"status" text DEFAULT 'active' NOT NULL,
	"budget" bigint NOT NULL,
	"reserved" bigint DEFAULT 0 NOT NULL,
	"spent" bigint DEFAULT 0 NOT NULL,
	"current_policy_version" integer DEFAULT 1 NOT NULL,
	"deadline" timestamp with time zone,
	"outcome_note" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_agents" ADD CONSTRAINT "task_agents_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_agents" ADD CONSTRAINT "task_agents_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_key_hash" ON "agents" USING btree ("api_key_hash");--> statement-breakpoint
CREATE INDEX "agents_org" ON "agents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "audit_org" ON "audit_events" USING btree ("org_id","seq");--> statement-breakpoint
CREATE INDEX "audit_subject" ON "audit_events" USING btree ("subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "policies_pk" ON "policies" USING btree ("task_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "providers_org_host" ON "providers" USING btree ("org_id","host");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_idem" ON "purchases" USING btree ("agent_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "purchases_task" ON "purchases" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "purchases_reuse" ON "purchases" USING btree ("org_id","reuse_key");--> statement-breakpoint
CREATE INDEX "purchases_agent_time" ON "purchases" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "task_agents_pk" ON "task_agents" USING btree ("task_id","agent_id");--> statement-breakpoint
CREATE INDEX "tasks_org" ON "tasks" USING btree ("org_id");