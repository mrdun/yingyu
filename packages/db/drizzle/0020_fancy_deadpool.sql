ALTER TABLE "commission_records" ADD COLUMN "rate_bps" integer DEFAULT 4000 NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "commission_rate_bps" integer DEFAULT 4000 NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_referral_code_unique" UNIQUE("referral_code");