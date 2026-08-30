import { createId } from "@paralleldrive/cuid2";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 会员购买订单 (Phase 3 第四期, 模拟支付)
 * 状态机: pending -> paid | failed
 */
export const orders = pgTable(
  "orders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    planId: text("plan_id").notNull(), // monthly | quarterly | yearly
    amountFen: integer("amount_fen").notNull(), // 人民币分
    status: text("status").notNull().default("pending"), // pending | paid | failed
    provider: text("provider").notNull().default("mock"), // mock | wechat(预留)
    providerOrderId: text("provider_order_id"),
    paidAt: timestamp("paid_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idx: index("orders_user_id_created_at_idx").on(t.userId, t.createdAt),
  }),
);
