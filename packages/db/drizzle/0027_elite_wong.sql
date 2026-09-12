CREATE TABLE IF NOT EXISTS "partner_commission_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_type" text DEFAULT 'lifetime' NOT NULL,
	"plan_id" text,
	"rate_bps" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"effective_to" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "partner_commission_rules" ADD CONSTRAINT "partner_commission_rules_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- 默认佣金规则: lifetime Partner 全 plan 40%
INSERT INTO "partner_commission_rules" ("id", "partner_type", "plan_id", "rate_bps", "status", "effective_from")
VALUES ('default_lifetime_all', 'lifetime', NULL, 4000, 'active', now())
ON CONFLICT ("id") DO NOTHING;
