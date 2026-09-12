ALTER TABLE "orders" ADD COLUMN "payment_method" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "provider_transaction_id" text;--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "payload" text;--> statement-breakpoint
-- 支付/订单运营参数 (幂等 seed, 不覆盖已有配置)
INSERT INTO "business_settings" ("key", "value") VALUES
	('order_expire_minutes', '120'),
	('payment_wechat_enabled', 'false'),
	('payment_alipay_enabled', 'false')
ON CONFLICT ("key") DO NOTHING;
