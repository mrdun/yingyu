CREATE TABLE IF NOT EXISTS "business_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commission_records" ALTER COLUMN "status" SET DEFAULT 'holding';--> statement-breakpoint
ALTER TABLE "commission_records" ADD COLUMN "hold_until" timestamp;
--> statement-breakpoint
-- 佣金状态机升级: holding/pending/payable/paid/reversed (手写: drizzle-kit 0.23 不支持从 schema 生成 CHECK)
ALTER TABLE "commission_records" DROP CONSTRAINT IF EXISTS "commission_records_status_check";
--> statement-breakpoint
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_status_check" CHECK ("status" IN ('holding', 'pending', 'payable', 'paid', 'reversed'));
--> statement-breakpoint
-- 默认退款保护期配置: 24 小时
INSERT INTO "business_settings" ("key", "value") VALUES ('refund_window_hours', '24')
ON CONFLICT ("key") DO NOTHING;
