import { createId } from "@paralleldrive/cuid2";
import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { statement } from "./statement";

/**
 * 用户 Statement 完成记录 (学习最小单位)。
 * 一用户一 statement 仅一条 (UNIQUE user_id + statement_id), 用于计算 Course/CoursePack 完成率。
 */
export const userStatementProgress = pgTable(
  "user_statement_progress",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    statementId: text("statement_id")
      .notNull()
      .references(() => statement.id),
    status: text("status").notNull().default("completed"), // completed (预留其他状态)
    completedAt: timestamp("completed_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    unq: unique("user_statement_progress_user_statement_unique").on(t.userId, t.statementId),
    idxUser: index("user_statement_progress_user_id_idx").on(t.userId),
  }),
);
