import { createId } from "@paralleldrive/cuid2";
import { index, integer, pgTable, real, text, timestamp, unique } from "drizzle-orm/pg-core";

import { statement } from "./statement";

export const reviewRecords = pgTable(
  "review_records",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    statementId: text("statement_id")
      .notNull()
      .references(() => statement.id),
    easeFactor: real("ease_factor").notNull().default(2.5),
    intervalDays: integer("interval_days").notNull().default(0),
    repetitions: integer("repetitions").notNull().default(0),
    nextReviewAt: timestamp("next_review_at"),
    lastReviewedAt: timestamp("last_reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    unq: unique("review_records_user_id_statement_id_unique").on(t.userId, t.statementId),
    idx: index("review_records_user_id_next_review_at_idx").on(t.userId, t.nextReviewAt),
  }),
);
