ALTER TABLE "tasks" ADD COLUMN "parent_task_id" text;--> statement-breakpoint
CREATE INDEX "tasks_parent" ON "tasks" USING btree ("parent_task_id");