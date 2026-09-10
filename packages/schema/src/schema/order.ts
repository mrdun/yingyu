import { createId } from "@paralleldrive/cuid2";
import { index, integer, pgTable, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";

import { plans } from "./plan";
import { user } from "./user";

/**
 * 会员购买订单 (商业化模型, 支持多支付渠道/退款/幂等)
 * 状态机: pending -> paid | failed | cancelled; paid -> refunded
 */
export const orders = pgTable(
  "orders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    amountFen: integer("amount_fen").notNull(), // 人民币分
    status: text("status").notNull().default("pending"), // pending | paid | failed | cancelled | refunded
    provider: text("provider").notNull().default("mock"), // mock | wechat | stripe
    providerOrderId: text("provider_order_id"),
    currency: varchar("currency", { length: 8 }).notNull().default("CNY"),
    paidAt: timestamp("paid_at"),
    refundedAt: timestamp("refunded_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    idx: index("orders_user_id_created_at_idx").on(t.userId, t.createdAt),
    unq: unique("orders_provider_order_id_unique").on(t.providerOrderId),
  }),
);
