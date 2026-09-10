import { createId } from "@paralleldrive/cuid2";
import { boolean, integer, pgTable, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";

/**
 * 会员计划 (数据库驱动, 用于替代硬编码 MEMBERSHIP_PLANS)。
 * id 使用语义化 slug: monthly / quarterly / yearly / lifetime (外部提供, 不自增)。
 */
export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  priceFen: integer("price_fen").notNull(),
  durationDays: integer("duration_days"), // null = 永久会员
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
});

/**
 * 计划权益 (key-value), 用于支持不同会员权益且免 schema 变更扩展。
 */
export const planEntitlements = pgTable(
  "plan_entitlements",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    entitlementKey: text("entitlement_key").notNull(),
    entitlementValue: text("entitlement_value").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    unq: unique("plan_entitlements_plan_id_entitlement_key_unique").on(
      t.planId,
      t.entitlementKey,
    ),
  }),
);
