import { createId } from "@paralleldrive/cuid2";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { plans } from "./plan";

/**
 * Partner 动态佣金规则 (可运营配置)。
 * 当前仅启用 partner_type=lifetime; plan_id=null 表示全局默认, 否则按 plan 覆盖。
 * 历史佣金使用快照 rate_bps, 不受规则后续修改影响。
 */
export const partnerCommissionRule = pgTable("partner_commission_rules", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  partnerType: text("partner_type").notNull().default("lifetime"),
  planId: text("plan_id").references(() => plans.id),
  rateBps: integer("rate_bps").notNull(),
  status: text("status").notNull().default("active"), // active / inactive
  effectiveFrom: timestamp("effective_from").notNull().defaultNow(),
  effectiveTo: timestamp("effective_to"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
});
