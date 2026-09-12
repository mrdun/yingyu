import { createId } from "@paralleldrive/cuid2";
import { index, integer, pgTable, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";

import { plans } from "./plan";
import { user } from "./user";

/**
 * 会员购买订单 (商业化模型, 支持多支付渠道/退款/幂等)
 * 状态机: pending -> processing | failed | cancelled | expired;
 *         processing -> paid | failed; paid -> refunding -> refunded | paid
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
    status: text("status").notNull().default("pending"), // pending|processing|paid|refunding|failed|cancelled|expired|refunded
    provider: text("provider").notNull().default("mock"), // mock | wechat | alipay
    paymentMethod: text("payment_method"), // wechat_native | wechat_jsapi | alipay_qr | mock
    providerOrderId: text("provider_order_id"),
    providerTransactionId: text("provider_transaction_id"), // 第三方交易号 (对账/退款用)
    idempotencyKey: text("idempotency_key"),
    currency: varchar("currency", { length: 8 }).notNull().default("CNY"),
    paidAt: timestamp("paid_at"),
    refundedAt: timestamp("refunded_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    idx: index("orders_user_id_created_at_idx").on(t.userId, t.createdAt),
    unq: unique("orders_provider_order_id_unique").on(t.providerOrderId),
    unqIdempotency: unique("orders_user_id_idempotency_key_unique").on(t.userId, t.idempotencyKey),
  }),
);
