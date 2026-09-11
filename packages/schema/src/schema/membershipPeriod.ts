import { createId } from "@paralleldrive/cuid2";
import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { membership } from "./membership";
import { orders } from "./order";
import { plans } from "./plan";

/**
 * 会员权益区间: 每一笔 paid order 对应一个明确的权益 period。
 * 退款时通过 order_id 精确撤销该订单产生的权益, 而不是靠 durationDays 猜测。
 * status: active / revoked
 */
export const membershipPeriod = pgTable(
  "membership_periods",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    membershipId: text("membership_id")
      .notNull()
      .references(() => membership.id),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    startAt: timestamp("start_at").notNull(),
    endAt: timestamp("end_at"), // null = 永久会员 period
    status: text("status").notNull().default("active"), // active / revoked
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    unqOrder: unique("membership_periods_order_id_unique").on(t.orderId),
    idxMembership: index("membership_periods_membership_id_idx").on(t.membershipId),
  }),
);
