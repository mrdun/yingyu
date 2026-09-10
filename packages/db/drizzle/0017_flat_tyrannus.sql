ALTER TABLE "orders" ADD COLUMN "currency" varchar(8) DEFAULT 'CNY' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "updated_at" timestamp;--> statement-breakpoint
-- 补 users 影子表的孤儿数据 (orders.user_id 早于 users 表建立, 先补齐再建 FK)
INSERT INTO "users" ("id") SELECT DISTINCT "user_id" FROM "orders" ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_provider_order_id_unique" UNIQUE("provider_order_id");
