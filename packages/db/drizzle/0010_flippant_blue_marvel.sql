CREATE TABLE IF NOT EXISTS "review_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"statement_id" text NOT NULL,
	"ease_factor" real DEFAULT 2.5 NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"next_review_at" timestamp,
	"last_reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "review_records_user_id_statement_id_unique" UNIQUE("user_id","statement_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_records" ADD CONSTRAINT "review_records_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_records_user_id_next_review_at_idx" ON "review_records" USING btree ("user_id","next_review_at");