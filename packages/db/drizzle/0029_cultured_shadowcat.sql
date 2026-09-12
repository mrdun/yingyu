ALTER TABLE "plans" ADD COLUMN "is_public" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
-- 商业参数统一配置中心默认值 (幂等)
INSERT INTO "business_settings" ("key", "value") VALUES
  ('refund_window_hours', '24'),
  ('commission_settlement_days', '7'),
  ('partner_enabled', 'true'),
  ('lifetime_partner_required', 'true'),
  ('currency', 'CNY')
ON CONFLICT ("key") DO NOTHING;
