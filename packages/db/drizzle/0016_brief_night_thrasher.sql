ALTER TABLE "memberships" ALTER COLUMN "end_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "plan_id" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
