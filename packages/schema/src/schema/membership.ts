import { createId } from "@paralleldrive/cuid2";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { plans } from "./plan";

export const membership = pgTable("memberships", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id").notNull(),
  start_date: timestamp("start_date").notNull(),
  end_date: timestamp("end_date"), // 永久会员 = null
  isActive: boolean("isActive").default(true), // 旧字段, 保留兼容
  planId: text("plan_id").references(() => plans.id), // 新字段
  status: text("status").notNull().default("active"), // active / cancelled
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  type: text("type").notNull().default("regular"), // 旧字段, 保留兼容
});
