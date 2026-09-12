-- 生产初始化治理 (TASK-002-I-05):
-- 1) 基础会员计划 + 默认权益, 避免 migration 后 plans 为空导致商城无法销售
-- 2) 默认佣金规则 (lifetime 全局 40%), 避免无规则时佣金静默为 0
-- 全部幂等 (ON CONFLICT DO NOTHING / WHERE NOT EXISTS), 可重复执行, 不覆盖已有运营配置。
-- 价格仅为初始值, 上线后以管理员后台 /admin/plans 与 /admin/commission-rules 为准。
INSERT INTO "plans" ("id", "name", "price_fen", "duration_days", "sort_order", "is_active", "is_public")
VALUES
	('monthly', '月度会员', 1800, 30, 1, true, true),
	('quarterly', '季度会员', 4800, 90, 2, true, true),
	('yearly', '年度会员', 16800, 365, 3, true, true),
	('lifetime', '永久会员', 19900, NULL, 4, true, true)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "plan_entitlements" ("id", "plan_id", "entitlement_key", "entitlement_value")
VALUES
	('pe_monthly_course_access', 'monthly', 'course_access', 'all'),
	('pe_quarterly_course_access', 'quarterly', 'course_access', 'all'),
	('pe_yearly_course_access', 'yearly', 'course_access', 'all'),
	('pe_lifetime_course_access', 'lifetime', 'course_access', 'all')
ON CONFLICT ("plan_id", "entitlement_key") DO NOTHING;--> statement-breakpoint
INSERT INTO "partner_commission_rules" ("id", "partner_type", "plan_id", "rate_bps", "status", "effective_from")
SELECT 'pcr_lifetime_default', 'lifetime', NULL, 4000, 'active', now()
WHERE NOT EXISTS (SELECT 1 FROM "partner_commission_rules");
