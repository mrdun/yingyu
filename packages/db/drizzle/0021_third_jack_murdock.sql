ALTER TABLE "course_packs" ADD COLUMN "status" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "course_packs" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "course_packs" ADD COLUMN "access_level" text DEFAULT 'membership' NOT NULL;--> statement-breakpoint
ALTER TABLE "statements" ADD COLUMN "source_type" text DEFAULT 'text';--> statement-breakpoint
ALTER TABLE "statements" ADD COLUMN "audio_url" text;--> statement-breakpoint
ALTER TABLE "statements" ADD COLUMN "start_ms" integer;--> statement-breakpoint
ALTER TABLE "statements" ADD COLUMN "end_ms" integer;--> statement-breakpoint
-- 历史数据迁移: 已有 course_packs 视为已发布、手动来源
UPDATE "course_packs" SET "status" = 'published', "source" = 'manual';--> statement-breakpoint
-- 历史数据迁移: access_level 依据 is_free 推导
UPDATE "course_packs" SET "access_level" = 'free' WHERE "is_free" = true;
