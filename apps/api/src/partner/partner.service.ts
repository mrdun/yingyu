import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";

import {
  businessSettings,
  commissionRecord,
  membership,
  partner,
  partnerCommissionRule,
  referral,
  user,
} from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";
import {
  canTransitionCommissionStatus,
  COMMISSION_STATUS,
  CommissionStatusValue,
} from "./commission-status";
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

  /** 退款保护期 (小时): 读取 business_settings, 缺省 24 */
  private async getRefundWindowHours(db: DbType = this.db): Promise<number> {
    const row = await db.query.businessSettings.findFirst({
      where: eq(businessSettings.key, "refund_window_hours"),
    });
    const parsed = row ? Number(row.value) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 24;
  }

  /** 布尔型商业参数, 缺省值兜底 */
  private async getBoolSetting(key: string, fallback: boolean): Promise<boolean> {
    const row = await this.db.query.businessSettings.findFirst({
      where: eq(businessSettings.key, key),
    });
    if (!row) return fallback;
    return row.value === "true";
  }

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
    if (!(await this.getBoolSetting("partner_enabled", true))) {
      throw new BadRequestException("Partner program is currently disabled");
    }
    const existing = await this.findByUserId(userId);
    if (existing) return existing;

    const lifetimeRequired = await this.getBoolSetting("lifetime_partner_required", true);
    if (lifetimeRequired && !(await this.isLifetimeMember(userId))) {
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
      holdingFen: sum(COMMISSION_STATUS.HOLDING),
      pendingFen: sum("pending"),
      payableFen: sum(COMMISSION_STATUS.PAYABLE),
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
    order: { id: string; userId: string; amountFen: number; planId: string },
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

    // 动态佣金规则 (partner_type + plan), 无有效规则则安全失败 (不默认40%)
    const rule = await this.findActiveCommissionRule("lifetime", order.planId, db);
    if (!rule) return null;

    const commissionFen = Math.floor((order.amountFen * rule.rateBps) / 10000);
    // 退款保护期: holding, hold_until = now + refund_window_hours
    const windowHours = await this.getRefundWindowHours(db);
    const holdUntil = new Date(Date.now() + windowHours * 60 * 60 * 1000);
    const [rec] = await db
      .insert(commissionRecord)
      .values({
        partnerUserId: p.userId,
        referredUserId: order.userId,
        orderId: order.id,
        orderAmountFen: order.amountFen,
        rate: rule.rateBps / 10000,
        rateBps: rule.rateBps,
        commissionFen,
        status: COMMISSION_STATUS.HOLDING,
        holdUntil,
      })
      .onConflictDoNothing({ target: commissionRecord.orderId })
      .returning();

    return rec ?? null;
  }

  /** 退款时把该订单佣金 holding/pending/payable/paid → reversed (在 refundOrder 事务内调用) */
  async reverseCommissionForOrder(orderId: string, tx?: DbType) {
    const db = tx ?? this.db;
    await db
      .update(commissionRecord)
      .set({ status: COMMISSION_STATUS.REVERSED, updatedAt: new Date() })
      .where(
        and(
          eq(commissionRecord.orderId, orderId),
          inArray(commissionRecord.status, [
            COMMISSION_STATUS.HOLDING,
            COMMISSION_STATUS.PENDING,
            COMMISSION_STATUS.PAYABLE,
            COMMISSION_STATUS.PAID,
          ]),
        ),
      );
  }

  /** 退款保护期结束: holding -> pending (幂等; 支持手动/未来 Cron) */
  async confirmExpiredCommission(now: Date = new Date()) {
    const rows = await this.db
      .update(commissionRecord)
      .set({ status: COMMISSION_STATUS.PENDING, updatedAt: new Date() })
      .where(
        and(
          eq(commissionRecord.status, COMMISSION_STATUS.HOLDING),
          lte(commissionRecord.holdUntil, now),
        ),
      )
      .returning({ id: commissionRecord.id });
    return { confirmed: rows.length };
  }

  /** 满足结算条件: pending -> payable (幂等) */
  async markCommissionPayable(commissionId: string) {
    return await this.transitionCommission(
      commissionId,
      COMMISSION_STATUS.PENDING,
      COMMISSION_STATUS.PAYABLE,
    );
  }

  /** 管理员结算: payable -> paid (幂等) */
  async settleCommission(commissionId: string) {
    const [updated] = await this.db
      .update(commissionRecord)
      .set({ status: COMMISSION_STATUS.PAID, paidAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(commissionRecord.id, commissionId),
          eq(commissionRecord.status, COMMISSION_STATUS.PAYABLE),
        ),
      )
      .returning();
    if (updated) return updated;
    // 已是 paid 幂等返回; 其他状态非法
    const existing = await this.db.query.commissionRecord.findFirst({
      where: eq(commissionRecord.id, commissionId),
    });
    if (!existing) throw new NotFoundException(`Commission ${commissionId} not found`);
    if (existing.status === COMMISSION_STATUS.PAID) return existing;
    throw new BadRequestException(
      `Illegal commission status transition: ${existing.status} -> ${COMMISSION_STATUS.PAID}`,
    );
  }

  private async transitionCommission(
    commissionId: string,
    from: CommissionStatusValue,
    to: CommissionStatusValue,
  ) {
    const existing = await this.db.query.commissionRecord.findFirst({
      where: eq(commissionRecord.id, commissionId),
    });
    if (!existing) throw new NotFoundException(`Commission ${commissionId} not found`);
    if (existing.status === to) return existing; // 幂等
    if (existing.status !== from || !canTransitionCommissionStatus(from, to)) {
      throw new BadRequestException(
        `Illegal commission status transition: ${existing.status} -> ${to}`,
      );
    }
    const [updated] = await this.db
      .update(commissionRecord)
      .set({ status: to, updatedAt: new Date() })
      .where(eq(commissionRecord.id, commissionId))
      .returning();
    return updated;
  }

  /** 查找当前生效的佣金规则: 优先特定 plan, 其次全局 (plan_id=null) */
  async findActiveCommissionRule(partnerType: string, planId: string, db: DbType = this.db) {
    const now = new Date();
    const baseWhere = and(
      eq(partnerCommissionRule.partnerType, partnerType),
      eq(partnerCommissionRule.status, "active"),
      lte(partnerCommissionRule.effectiveFrom, now),
      or(isNull(partnerCommissionRule.effectiveTo), gte(partnerCommissionRule.effectiveTo, now)),
    );

    const specific = await db.query.partnerCommissionRule.findFirst({
      where: and(baseWhere, eq(partnerCommissionRule.planId, planId)),
    });
    if (specific) return specific;

    return await db.query.partnerCommissionRule.findFirst({
      where: and(baseWhere, isNull(partnerCommissionRule.planId)),
    });
  }

  async listCommissionRules() {
    return await this.db.query.partnerCommissionRule.findMany({
      orderBy: desc(partnerCommissionRule.createdAt),
    });
  }

  async createCommissionRule(dto: {
    partnerType?: string;
    planId?: string | null;
    rateBps: number;
    status?: string;
    effectiveFrom?: Date;
    effectiveTo?: Date | null;
  }) {
    this.assertValidRateBps(dto.rateBps);
    const [rule] = await this.db
      .insert(partnerCommissionRule)
      .values({
        partnerType: dto.partnerType ?? "lifetime",
        planId: dto.planId ?? null,
        rateBps: dto.rateBps,
        status: dto.status ?? "active",
        effectiveFrom: dto.effectiveFrom ?? new Date(),
        effectiveTo: dto.effectiveTo ?? null,
      })
      .returning();
    return rule;
  }

  async updateCommissionRule(
    id: string,
    dto: {
      planId?: string | null;
      rateBps?: number;
      status?: string;
      effectiveFrom?: Date;
      effectiveTo?: Date | null;
    },
  ) {
    const existing = await this.db.query.partnerCommissionRule.findFirst({
      where: eq(partnerCommissionRule.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Commission rule ${id} not found`);
    }
    if (dto.rateBps !== undefined) this.assertValidRateBps(dto.rateBps);

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.planId !== undefined) set.planId = dto.planId;
    if (dto.rateBps !== undefined) set.rateBps = dto.rateBps;
    if (dto.status !== undefined) set.status = dto.status;
    if (dto.effectiveFrom !== undefined) set.effectiveFrom = dto.effectiveFrom;
    if (dto.effectiveTo !== undefined) set.effectiveTo = dto.effectiveTo;

    const [updated] = await this.db
      .update(partnerCommissionRule)
      .set(set)
      .where(eq(partnerCommissionRule.id, id))
      .returning();
    return updated;
  }

  private assertValidRateBps(rateBps: number) {
    if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000) {
      throw new BadRequestException("rateBps must be an integer between 0 and 10000");
    }
  }
}
