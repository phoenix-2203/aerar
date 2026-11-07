CREATE TABLE "seals" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"seq" integer NOT NULL,
	"head" text NOT NULL,
	"entries" integer NOT NULL,
	"tx_hash" text NOT NULL,
	"contract" text NOT NULL,
	"sealer" text NOT NULL,
	"sealed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "seals_org" ON "seals" USING btree ("org_id","seq");