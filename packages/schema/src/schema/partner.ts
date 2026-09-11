import { createId } from "@paralleldrive/cuid2";
import { index, integer, pgTable, real, text, timestamp, unique } from "drizzle-orm/pg-core";

import { orders } from "./order";
import { user } from "./user";

/** Partner 推广资格 (普通用户默认不是 Partner, 只有此表存在记录才具备推广资格) */
export const partner = pgTable(
  "partners",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    commissionRate: real("commission_rate").notNull().default(0.4),
    status: text("status").notNull().default("active"), // active / inactive
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    unqUser: unique("partners_user_id_unique").on(t.userId),
  }),
);

/** 归因: 一个用户只能被归因一次 (referred_user_id 唯一), 防止自邀请与重复绑定 */
export const referral = pgTable(
  "referrals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    referrerId: text("referrer_id")
      .notNull()
      .references(() => user.id),
    referredUserId: text("referred_user_id")
      .notNull()
      .references(() => user.id),
    referralCode: text("referral_code").notNull(),
    source: text("source"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    unqReferred: unique("referrals_referred_user_id_unique").on(t.referredUserId),
    idxReferrer: index("referrals_referrer_id_idx").on(t.referrerId),
  }),
);

/** 佣金记录: 每笔订单最多一条 (order_id 唯一), 金额/比例快照, 退款时 reversed */
export const commissionRecord = pgTable(
  "commission_records",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    partnerUserId: text("partner_user_id")
      .notNull()
      .references(() => user.id),
    referredUserId: text("referred_user_id")
      .notNull()
      .references(() => user.id),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    orderAmountFen: integer("order_amount_fen").notNull(),
    rate: real("rate").notNull(),
    commissionFen: integer("commission_fen").notNull(),
    status: text("status").notNull().default("pending"), // pending / paid / reversed
    createdAt: timestamp("created_at").notNull().defaultNow(),
    paidAt: timestamp("paid_at"),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    unqOrder: unique("commission_records_order_id_unique").on(t.orderId),
    idxPartner: index("commission_records_partner_user_id_idx").on(t.partnerUserId),
  }),
);
