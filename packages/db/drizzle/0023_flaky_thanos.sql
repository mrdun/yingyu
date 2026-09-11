CREATE TABLE IF NOT EXISTS "user_statement_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"statement_id" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "user_statement_progress_user_statement_unique" UNIQUE("user_id","statement_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_statement_progress" ADD CONSTRAINT "user_statement_progress_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_statement_progress_user_id_idx" ON "user_statement_progress" USING btree ("user_id");