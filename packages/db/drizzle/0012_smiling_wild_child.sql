CREATE TABLE IF NOT EXISTS "coin_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"related_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"task_type" text NOT NULL,
	"completed" boolean DEFAULT true NOT NULL,
	"reward_coins" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daily_tasks_user_date_task_unique" UNIQUE("user_id","date","task_type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_coins" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "user_coins_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coin_transactions_user_id_created_at_idx" ON "coin_transactions" USING btree ("user_id","created_at");