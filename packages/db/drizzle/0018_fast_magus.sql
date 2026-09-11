CREATE TABLE IF NOT EXISTS "membership_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"membership_id" text NOT NULL,
	"order_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "membership_periods_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "membership_periods_membership_id_idx" ON "membership_periods" USING btree ("membership_id");