import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, inArray } from "drizzle-orm";

import { commissionRecord, membership, partner, referral, user } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";
import { canTransitionPartnerStatus, PARTNER_STATUS } from "./partner-status";

/** 隐私脱敏: 只保留首字符, 不返回完整用户名 */
function maskUsername(username: string | null): string {
  if (!username) return "***";
  return username.slice(0, 1) + "***";
}

/**
 * Partner / Referral / Commission 业务逻辑。
 * 佣金比例使用整数 basis points (40% = 4000), 避免浮点财务精度问题。
 */
@Injectable()
export class PartnerService {
  constructor(@Inject(DB) private db: DbType) {}

  async findByUserId(userId: string) {
    return await this.db.query.partner.findFirst({ where: eq(partner.userId, userId) });
  }

  async listPartners() {
    return await this.db.query.partner.findMany({
      orderBy: desc(partner.createdAt),
    });
  }

  async getPartner(partnerId: string) {
    return await this.findPartnerOrThrow(partnerId);
  }

  async isActivePartner(userId: string) {
    const p = await this.findByUserId(userId);
    return Boolean(p && p.status === "active");
  }

  private async findPartnerOrThrow(partnerId: string) {
    const p = await this.db.query.partner.findFirst({ where: eq(partner.id, partnerId) });
    if (!p) {
      throw new NotFoundException(`Partner ${partnerId} not found`);
    }
    return p;
  }

  /** 只有有效 lifetime 会员可以申请成为 Partner (以 DB 权益为准, 不信任前端) */
  private async isLifetimeMember(userId: string): Promise<boolean> {
    const m = await this.db.query.membership.findFirst({
      where: and(
        eq(membership.userId, userId),
        eq(membership.status, "active"),
        eq(membership.planId, "lifetime"),
      ),
    });
    return Boolean(m);
  }

  /**
   * 用户申请成为 Partner (lifetime 会员): 创建 pending 记录。
   * 幂等: 已存在 (pending/active/suspended/rejected) 返回现有记录。
   */
  async apply(userId: string) {
    const existing = await this.findByUserId(userId);
    if (existing) return existing;

    if (!(await this.isLifetimeMember(userId))) {
      throw new BadRequestException("Only lifetime members can apply to become a partner");
    }

    const referralCode = createId();
    const [created] = await this.db
      .insert(partner)
      .values({
        userId,
        referralCode,
        commissionRate: 0.4,
        commissionRateBps: 4000,
        status: PARTNER_STATUS.PENDING,
      })
      .onConflictDoNothing({ target: partner.userId })
      .returning();

    return created ?? (await this.findByUserId(userId))!;
  }

  /** 状态机统一入口: 校验 from -> to 并更新 status */
  private async transitionPartnerStatus(
    partnerId: string,
    from: (typeof PARTNER_STATUS)[keyof typeof PARTNER_STATUS],
    to: (typeof PARTNER_STATUS)[keyof typeof PARTNER_STATUS],
  ) {
    const p = await this.findPartnerOrThrow(partnerId);
    if (p.status !== from) {
      throw new BadRequestException(`Partner ${partnerId} is ${p.status}, expected ${from}`);
    }
    if (!canTransitionPartnerStatus(from, to)) {
      throw new BadRequestException(`Illegal partner status transition: ${from} -> ${to}`);
    }
    const [updated] = await this.db
      .update(partner)
      .set({ status: to, updatedAt: new Date() })
      .where(eq(partner.id, partnerId))
      .returning();
    return updated;
  }

  async approvePartner(partnerId: string) {
    return await this.transitionPartnerStatus(
      partnerId,
      PARTNER_STATUS.PENDING,
      PARTNER_STATUS.ACTIVE,
    );
  }

  async rejectPartner(partnerId: string) {
    return await this.transitionPartnerStatus(
      partnerId,
      PARTNER_STATUS.PENDING,
      PARTNER_STATUS.REJECTED,
    );
  }

  async activatePartner(partnerId: string) {
    return await this.transitionPartnerStatus(
      partnerId,
      PARTNER_STATUS.SUSPENDED,
      PARTNER_STATUS.ACTIVE,
    );
  }

  async suspendPartner(partnerId: string) {
    return await this.transitionPartnerStatus(
      partnerId,
      PARTNER_STATUS.ACTIVE,
      PARTNER_STATUS.SUSPENDED,
    );
  }

  /**
   * 让用户直接成为 active Partner (仅供测试/内部种子数据使用)。
   * 正式流程走 apply + approve (状态机), 不要通过本方法绕过 pending 审核。
   */
  async becomePartner(userId: string, commissionRateBps = 4000) {
    if (
      !Number.isInteger(commissionRateBps) ||
      commissionRateBps < 0 ||
      commissionRateBps > 10000
    ) {
      throw new BadRequestException("commissionRateBps must be an integer between 0 and 10000");
    }
    const referralCode = createId();
    const [p] = await this.db
      .insert(partner)
      .values({
        userId,
        referralCode,
        commissionRate: commissionRateBps / 10000,
        commissionRateBps,
        status: "active",
      })
      .onConflictDoUpdate({
        target: partner.userId,
        set: {
          commissionRate: commissionRateBps / 10000,
          commissionRateBps,
          status: "active",
          updatedAt: new Date(),
        },
      })
      .returning();
    return p;
  }

  /** 归因: 只发生一次; 防自邀请、防重复绑定 */
  async attributeReferral(referralCode: string, referredUserId: string) {
    const referrer = await this.db.query.partner.findFirst({
      where: and(eq(partner.referralCode, referralCode), eq(partner.status, "active")),
    });
    if (!referrer) {
      return { attributed: false, reason: "partner_not_found" };
    }
    if (referrer.userId === referredUserId) {
      return { attributed: false, reason: "self_referral" };
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

    // 隐私: 不返回 referrer_id / referred_user_id / referral_code 等内部标识
    const referredIds = refs.map((r) => r.referredUserId);
    const users = referredIds.length
      ? await this.db
          .select({ id: user.id, username: user.username })
          .from(user)
          .where(inArray(user.id, referredIds))
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.username]));

    const commissionRows = referredIds.length
      ? await this.db
          .select({
            referredUserId: commissionRecord.referredUserId,
            commissionFen: commissionRecord.commissionFen,
            status: commissionRecord.status,
          })
          .from(commissionRecord)
          .where(
            and(
              eq(commissionRecord.partnerUserId, partnerUserId),
              inArray(commissionRecord.referredUserId, referredIds),
            ),
          )
      : [];
    const commissionByUser = new Map<string, number>();
    for (const c of commissionRows) {
      if (c.status === "reversed") continue;
      commissionByUser.set(
        c.referredUserId,
        (commissionByUser.get(c.referredUserId) ?? 0) + c.commissionFen,
      );
    }

    return {
      count: refs.length,
      referrals: refs.map((r) => ({
        createdAt: r.createdAt,
        username: maskUsername(userMap.get(r.referredUserId) ?? null),
        commissionFen: commissionByUser.get(r.referredUserId) ?? 0,
      })),
    };
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
   * 整数计算: commission_fen = floor(order_amount_fen * rate_bps / 10000); 比例快照。
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

    const commissionFen = Math.floor((order.amountFen * p.commissionRateBps) / 10000);
    const [rec] = await db
      .insert(commissionRecord)
      .values({
        partnerUserId: p.userId,
        referredUserId: order.userId,
        orderId: order.id,
        orderAmountFen: order.amountFen,
        rate: p.commissionRateBps / 10000,
        rateBps: p.commissionRateBps,
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
