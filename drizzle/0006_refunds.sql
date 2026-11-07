ALTER TABLE "purchases" ADD COLUMN "escrow" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "escrow_hold_id" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "refunded_amount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "refund_tx" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "refunded_at" timestamp with time zone;