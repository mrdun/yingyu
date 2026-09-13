-- 补齐历史遗漏的 migration (TASK-002-J-01 任务四):
-- 这三张表已存在于 schema 与 snapshot 中, 但历史 migration 缺失建表 SQL,
-- 导致「全新空库 + drizzle-kit migrate」后缺表 (学习路线 / 看图学词功能不可用)。
-- 全部 IF NOT EXISTS, 对已有环境无副作用, 可重复执行。
CREATE TABLE IF NOT EXISTS "learning_paths" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '',
	"cover" text,
	"order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_path_items" (
	"id" text PRIMARY KEY NOT NULL,
	"learning_path_id" text NOT NULL,
	"course_pack_id" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"stage" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "learning_path_items_learning_path_id_course_pack_id_unique" UNIQUE("learning_path_id","course_pack_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "picture_words" (
	"id" text PRIMARY KEY NOT NULL,
	"word" text NOT NULL,
	"chinese" text NOT NULL,
	"soundmark" text DEFAULT '',
	"image_url" text NOT NULL,
	"example_sentence" text DEFAULT '',
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "learning_path_items" ADD CONSTRAINT "learning_path_items_learning_path_id_learning_paths_id_fk" FOREIGN KEY ("learning_path_id") REFERENCES "learning_paths"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "learning_path_items" ADD CONSTRAINT "learning_path_items_course_pack_id_course_packs_id_fk" FOREIGN KEY ("course_pack_id") REFERENCES "course_packs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
