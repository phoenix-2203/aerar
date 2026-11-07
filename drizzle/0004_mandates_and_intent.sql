ALTER TABLE "policies" ADD COLUMN "mandate" jsonb;--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN "mandate_hash" text;--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN "mandate_sig" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "mandate_hash" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "intent" jsonb;