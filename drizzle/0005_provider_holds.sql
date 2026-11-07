ALTER TABLE "providers" ADD COLUMN "held_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "held_reason" text;