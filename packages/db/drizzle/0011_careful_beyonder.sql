CREATE TABLE IF NOT EXISTS "course_ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"course_pack_id" text NOT NULL,
	"course_id" text NOT NULL,
	"score_rate" real NOT NULL,
	"grade" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "course_ratings_user_pack_course_unique" UNIQUE("user_id","course_pack_id","course_id")
);
