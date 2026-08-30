import { createId } from "@paralleldrive/cuid2";
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/**
 * 用户金币余额 (每个用户一条记录)
 */
export const userCoins = pgTable(
  "user_coins",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    coins: integer("coins").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    unq: unique("user_coins_user_id_unique").on(t.userId),
  }),
);

/**
 * 金币流水: amount 正数为赚取, 负数为消耗
 */
export const coinTransactions = pgTable(
  "coin_transactions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    relatedId: text("related_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idx: index("coin_transactions_user_id_created_at_idx").on(t.userId, t.createdAt),
  }),
);

/**
 * 每日任务完成记录 (幂等: userId + date + taskType 唯一)
 */
export const dailyTasks = pgTable(
  "daily_tasks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    date: date("date").notNull(),
    taskType: text("task_type").notNull(),
    completed: boolean("completed").notNull().default(true),
    rewardCoins: integer("reward_coins").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    unq: unique("daily_tasks_user_date_task_unique").on(t.userId, t.date, t.taskType),
  }),
);
