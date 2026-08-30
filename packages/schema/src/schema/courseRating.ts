import { createId } from "@paralleldrive/cuid2";
import { pgTable, real, text, timestamp, unique } from "drizzle-orm/pg-core";

export const courseRating = pgTable(
  "course_ratings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    coursePackId: text("course_pack_id").notNull(),
    courseId: text("course_id").notNull(),
    /**
     * 0-100 的一次性正确率
     */
    scoreRate: real("score_rate").notNull(),
    /**
     * C / B / A / S / SS / SSS
     */
    grade: text("grade").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    unq: unique("course_ratings_user_pack_course_unique").on(t.userId, t.coursePackId, t.courseId),
  }),
);
