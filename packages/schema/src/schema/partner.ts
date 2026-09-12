import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, real, text, timestamp, unique } from "drizzle-orm/pg-core";

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
    referralCode: text("referral_code"), // 独立推广码, Partner 创建时生成
    commissionRate: real("commission_rate").notNull().default(0.4), // 旧字段, 保留兼容
    commissionRateBps: integer("commission_rate_bps").notNull().default(4000), // 40% = 4000
    status: text("status").notNull().default("pending"), // pending / active / suspended / rejected
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    unqUser: unique("partners_user_id_unique").on(t.userId),
    unqCode: unique("partners_referral_code_unique").on(t.referralCode),
    chkRateBps: check(
      "partners_commission_rate_bps_check",
      sql`${t.commissionRateBps} >= 0 AND ${t.commissionRateBps} <= 10000`,
    ),
    chkStatus: check(
      "partners_status_check",
      sql`${t.status} IN ('pending', 'active', 'suspended', 'rejected')`,
    ),
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
    chkNoSelfReferral: check(
      "referrals_no_self_referral_check",
      sql`${t.referrerId} <> ${t.referredUserId}`,
    ),
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
    rate: real("rate").notNull(), // 旧字段, 保留兼容
    rateBps: integer("rate_bps").notNull().default(4000),
    commissionFen: integer("commission_fen").notNull(),
    // holding (退款保护期) / pending / payable / paid / reversed
    status: text("status").notNull().default("holding"),
    holdUntil: timestamp("hold_until"), // 退款保护期结束时间 (holding -> pending)
    createdAt: timestamp("created_at").notNull().defaultNow(),
    paidAt: timestamp("paid_at"),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    unqOrder: unique("commission_records_order_id_unique").on(t.orderId),
    idxPartner: index("commission_records_partner_user_id_idx").on(t.partnerUserId),
    chkOrderAmount: check(
      "commission_records_order_amount_fen_check",
      sql`${t.orderAmountFen} >= 0`,
    ),
    chkCommission: check("commission_records_commission_fen_check", sql`${t.commissionFen} >= 0`),
    chkRateBps: check(
      "commission_records_rate_bps_check",
      sql`${t.rateBps} >= 0 AND ${t.rateBps} <= 10000`,
    ),
    chkStatus: check(
      "commission_records_status_check",
      sql`${t.status} IN ('holding', 'pending', 'payable', 'paid', 'reversed')`,
    ),
  }),
);
