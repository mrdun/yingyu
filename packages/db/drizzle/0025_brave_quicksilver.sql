-- Partner 生命周期状态机: 由 active/inactive 升级为 pending/active/suspended/rejected
-- 1) 旧数据 inactive -> suspended (语义等价)
-- 2) 更新 status CHECK 约束 (手写: drizzle-kit 0.23 不支持从 schema 生成 CHECK)

--> statement-breakpoint
UPDATE "partners" SET "status" = 'suspended' WHERE "status" = 'inactive';
--> statement-breakpoint
ALTER TABLE "partners" DROP CONSTRAINT "partners_status_check";
--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_status_check" CHECK ("status" IN ('pending', 'active', 'suspended', 'rejected'));
