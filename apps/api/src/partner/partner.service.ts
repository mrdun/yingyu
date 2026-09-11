import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";

import { commissionRecord, partner, referral } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";

/**
 * Partner / Referral / Commission 业务逻辑。
 * referral_code 即 Partner 的 user_id (最小设计, 无需额外 code 表)。
 */
@Injectable()
export class PartnerService {
  constructor(@Inject(DB) private db: DbType) {}

  async findByUserId(userId: string) {
    return await this.db.query.partner.findFirst({ where: eq(partner.userId, userId) });
  }

  async isActivePartner(userId: string) {
    const p = await this.findByUserId(userId);
    return Boolean(p && p.status === "active");
  }

  /** 让用户成为 Partner (默认 40%), 供管理员/测试使用 */
  async becomePartner(userId: string, commissionRate = 0.4) {
    const [p] = await this.db
      .insert(partner)
      .values({ userId, commissionRate, status: "active" })
      .onConflictDoUpdate({
        target: partner.userId,
        set: { commissionRate, status: "active", updatedAt: new Date() },
      })
      .returning();
    return p;
  }

  /** 归因: 只发生一次; 防自邀请、防重复绑定 */
  async attributeReferral(referralCode: string, referredUserId: string) {
    if (referralCode === referredUserId) {
      return { attributed: false, reason: "self_referral" };
    }

    const referrer = await this.db.query.partner.findFirst({
      where: and(eq(partner.userId, referralCode), eq(partner.status, "active")),
    });
    if (!referrer) {
      return { attributed: false, reason: "partner_not_found" };
    }

    const existing = await this.db.query.referral.findFirst({
      where: eq(referral.referredUserId, referredUserId),
    });
    if (existing) {
      return { attributed: false, reason: "already_referred" };
    }

    const inserted = await this.db
      .insert(referral)
      .values({ referrerId: referrer.userId, referredUserId, referralCode })
      .onConflictDoNothing({ target: referral.referredUserId })
      .returning({ id: referral.id });

    return { attributed: inserted.length > 0 };
  }

  async listReferrals(partnerUserId: string) {
    const refs = await this.db.query.referral.findMany({
      where: eq(referral.referrerId, partnerUserId),
      orderBy: desc(referral.createdAt),
    });
    return { count: refs.length, referrals: refs };
  }

  async getCommissionSummary(partnerUserId: string) {
    const records = await this.db
      .select()
      .from(commissionRecord)
      .where(eq(commissionRecord.partnerUserId, partnerUserId));

    const sum = (status: string) =>
      records.filter((r) => r.status === status).reduce((s, r) => s + r.commissionFen, 0);

    return {
      totalCommissionFen: records
        .filter((r) => r.status !== "reversed")
        .reduce((s, r) => s + r.commissionFen, 0),
      pendingFen: sum("pending"),
      paidFen: sum("paid"),
      reversedFen: sum("reversed"),
      count: records.length,
    };
  }

  /**
   * 订单支付成功后生成佣金 (在 markOrderPaid 事务内调用)。
   * 一笔订单最多一条 (order_id 唯一); 金额/比例快照。
   */
  async generateCommissionForOrder(
    order: { id: string; userId: string; amountFen: number },
    tx?: DbType,
  ) {
    const db = tx ?? this.db;

    const [ref] = await db
      .select()
      .from(referral)
      .where(eq(referral.referredUserId, order.userId))
      .limit(1);
    if (!ref) return null;

    const [p] = await db
      .select()
      .from(partner)
      .where(and(eq(partner.userId, ref.referrerId), eq(partner.status, "active")))
      .limit(1);
    if (!p) return null;

    const commissionFen = Math.round(order.amountFen * p.commissionRate);
    const [rec] = await db
      .insert(commissionRecord)
      .values({
        partnerUserId: p.userId,
        referredUserId: order.userId,
        orderId: order.id,
        orderAmountFen: order.amountFen,
        rate: p.commissionRate,
        commissionFen,
        status: "pending",
      })
      .onConflictDoNothing({ target: commissionRecord.orderId })
      .returning();

    return rec ?? null;
  }

  /** 退款时把该订单佣金 pending/paid → reversed (在 refundOrder 事务内调用) */
  async reverseCommissionForOrder(orderId: string, tx?: DbType) {
    const db = tx ?? this.db;
    await db
      .update(commissionRecord)
      .set({ status: "reversed", updatedAt: new Date() })
      .where(
        and(
          eq(commissionRecord.orderId, orderId),
          inArray(commissionRecord.status, ["pending", "paid"]),
        ),
      );
  }
}
