-- Partner / Referral / Commission 数据完整性 CHECK 约束 (手写迁移)
-- 说明: drizzle-kit 0.23.0 不支持从 schema 生成 CHECK 约束, 因此本迁移为手写。
-- schema (packages/schema/src/schema/partner.ts) 中保留 check() 声明以便未来升级 drizzle-kit 后由 schema 接管。
-- 全部为 add-only; 约束条件与已有数据兼容 (金额/比例非负, 状态为当前合法枚举)。

--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "partners" ADD CONSTRAINT "partners_commission_rate_bps_check" CHECK ("commission_rate_bps" >= 0 AND "commission_rate_bps" <= 10000);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "partners" ADD CONSTRAINT "partners_status_check" CHECK ("status" IN ('active', 'inactive'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referrals" ADD CONSTRAINT "referrals_no_self_referral_check" CHECK ("referrer_id" <> "referred_user_id");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_order_amount_fen_check" CHECK ("order_amount_fen" >= 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_commission_fen_check" CHECK ("commission_fen" >= 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_rate_bps_check" CHECK ("rate_bps" >= 0 AND "rate_bps" <= 10000);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_status_check" CHECK ("status" IN ('pending', 'paid', 'reversed'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
