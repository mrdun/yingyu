import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { and, eq, isNull, lt } from "drizzle-orm";

import { coinTransactions, membership, membershipPeriod, orders, plans } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";
import { PartnerService } from "../partner/partner.service";
import { BuyMembershipDto, MembershipPeriod } from "./dto/buy-membership.dto";
import { MembershipType } from "./types/membership.types";
import { OrderStatus } from "./types/order-status";

@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);
  constructor(
    @Inject(DB) private db: DbType,
    private readonly partnerService: PartnerService,
  ) {}

  /** 查询 DB plans (金额/时长唯一可信来源) */
  private async getPlan(planId: string, db: DbType = this.db) {
    return await db.query.plans.findFirst({
      where: eq(plans.id, planId),
    });
  }

  async upsert(startDate: Date, buyMembershipDto: BuyMembershipDto) {
    const { userId } = buyMembershipDto;

    const membershipEntity = await this.findMembership(userId);

    if (membershipEntity && membershipEntity.isActive) {
      // 如果用户是激活状态的会员，则延长会员期限
      const endDate = this.calculateEndDate(membershipEntity.end_date, buyMembershipDto);
      await this.db
        .update(membership)
        .set({
          end_date: endDate,
        })
        .where(eq(membership.userId, userId));

      this.logger.log(`Membership for user ${userId} extend end date to ${endDate}`);

      return { endDate, startDate, isActive: true };
    } else {
      // 如果用户不是会员或会员已过期，则创建新会员或重置会员期限
      const endDate = this.calculateEndDate(startDate, buyMembershipDto);

      if (!membershipEntity) {
        // 如果用户不是会员，则创建新会员记录
        await this.db.insert(membership).values({
          userId,
          start_date: startDate,
          end_date: endDate,
          isActive: true,
        });

        this.logger.log(`Membership for user ${userId} has been created`);
      } else {
        await this.db
          .update(membership)
          .set({ end_date: endDate, isActive: true, start_date: startDate })
          .where(eq(membership.userId, userId));

        this.logger.log(`Membership for user ${userId} has been updated`);
      }

      return { endDate, startDate, isActive: true };
    }
  }

  private async findMembership(userId: string, db: DbType = this.db) {
    const result = await db.select().from(membership).where(eq(membership.userId, userId));
    return result[0];
  }

  private calculateEndDate(startDate: Date, buyMembershipDto: BuyMembershipDto) {
    const { period, duration } = buyMembershipDto;
    const endDate = new Date(startDate);
    if (period === MembershipPeriod.MONTH) {
      endDate.setMonth(endDate.getMonth() + Number(duration));
    } else if (period === MembershipPeriod.YEAR) {
      endDate.setFullYear(endDate.getFullYear() + Number(duration));
    }
    return endDate;
  }

  /**
   * 会员数据迁移: 旧模型 (type + isActive) → 新模型 (plan_id + status + end_date)。
   * 幂等 (只处理 plan_id 为 null 的记录)。供测试与一次性迁移使用。
   */
  async migrateLegacyMemberships() {
    // 确保 legacy_regular 计划存在 (无法推断时长的 regular 会员兜底)
    await this.db
      .insert(plans)
      .values({
        id: "legacy_regular",
        name: "旧版普通会员",
        priceFen: 0,
        durationDays: null,
        sortOrder: 99,
        isActive: false,
      })
      .onConflictDoNothing({ target: plans.id });

    // founder → lifetime (永久会员, end_date = null)
    await this.db
      .update(membership)
      .set({ planId: "lifetime", status: "active", end_date: null })
      .where(and(eq(membership.type, "founder"), isNull(membership.planId)));

    // regular → 按 end_date - start_date 推断计划
    const regularMembers = await this.db
      .select()
      .from(membership)
      .where(and(eq(membership.type, "regular"), isNull(membership.planId)));

    for (const m of regularMembers) {
      const planId =
        m.end_date == null
          ? "legacy_regular"
          : this.inferPlanId(
              Math.round((m.end_date.getTime() - m.start_date.getTime()) / (24 * 60 * 60 * 1000)),
            );
      await this.db
        .update(membership)
        .set({ planId, status: "active" })
        .where(eq(membership.id, m.id));
    }

    return { migrated: regularMembers.length };
  }

  private inferPlanId(durationDays: number): string {
    if (durationDays >= 27 && durationDays <= 32) return "monthly";
    if (durationDays >= 88 && durationDays <= 93) return "quarterly";
    if (durationDays >= 360 && durationDays <= 370) return "yearly";
    return "legacy_regular";
  }

  /**
   * 为历史已支付订单回填 membership_periods (best-effort)。
   * 历史 stacking 无法可靠还原, 这里用近似区间 (start_at=paid_at, end_at=paid_at+durationDays);
   * 幂等 (按 order_id 唯一)。无法用硬编码计划还原的订单 (lifetime/legacy) 跳过并记录限制。
   */
  async backfillMembershipPeriods() {
    const paidOrders = await this.db
      .select()
      .from(orders)
      .where(eq(orders.status, OrderStatus.PAID));
    let backfilled = 0;
    let skipped = 0;
    for (const order of paidOrders) {
      const plan = await this.getPlan(order.planId);
      if (!plan) {
        skipped++;
        continue;
      }
      const m = await this.findMembership(order.userId);
      if (!m) {
        skipped++;
        continue;
      }
      const startAt = order.paidAt ?? order.createdAt;
      const endAt =
        plan.durationDays == null
          ? null
          : new Date(startAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
      const inserted = await this.db
        .insert(membershipPeriod)
        .values({
          membershipId: m.id,
          orderId: order.id,
          planId: order.planId,
          startAt,
          endAt,
          status: "active",
        })
        .onConflictDoNothing({ target: membershipPeriod.orderId })
        .returning({ id: membershipPeriod.id });
      if (inserted.length > 0) backfilled++;
    }
    return { backfilled, skipped };
  }

  async isMember(userId: string): Promise<boolean> {
    const result = await this.db.query.membership.findFirst({
      where: eq(membership.userId, userId),
    });

    if (!result) return false;

    // 新模型: status=active 且 (永久 end_date=null 或 未过期), 替代 isActive
    return result.status === "active" && (result.end_date === null || result.end_date > new Date());
  }

  /**
   * 当前用户会员状态 (供 /membership/status 与 /membership/my)
   */
  async getMembershipStatus(userId: string) {
    const result = await this.db.query.membership.findFirst({
      where: eq(membership.userId, userId),
    });

    const isMember = Boolean(
      result?.status === "active" && (result.end_date === null || result.end_date > new Date()),
    );
    return {
      isMember,
      type: result?.type ?? null,
      planId: result?.planId ?? null,
      startDate: isMember ? result.start_date : null,
      endDate: isMember ? result.end_date : null,
    };
  }

  /**
   * 订单支付成功后开通/延长会员, 并为该订单创建一条明确的权益 period。
   * start_at = 当前有效 end (若已过期则为 now), end_at = start_at + durationDays (永久 = null)。
   */
  async activateForDays(
    userId: string,
    durationDays: number | null,
    planId: string,
    orderId: string,
    tx?: DbType,
  ) {
    const db = tx ?? this.db;
    const now = new Date();
    const membershipEntity = await this.findMembership(userId, db);

    let membershipId: string;
    let effectiveEnd: Date | null = null;

    if (!membershipEntity) {
      const [created] = await db
        .insert(membership)
        .values({
          userId,
          start_date: now,
          end_date: null,
          isActive: true,
          status: "active",
          planId,
        })
        .returning();
      membershipId = created.id;
    } else {
      membershipId = membershipEntity.id;
      effectiveEnd = await this.computeEffectiveEnd(membershipId, db);
    }

    const startAt = effectiveEnd && effectiveEnd > now ? effectiveEnd : now;
    const endAt =
      durationDays == null
        ? null
        : new Date(startAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

    await db.insert(membershipPeriod).values({
      membershipId,
      orderId,
      planId,
      startAt,
      endAt,
      status: "active",
    });

    const newEffectiveEnd = await this.computeEffectiveEnd(membershipId, db);
    await db
      .update(membership)
      .set({ end_date: newEffectiveEnd, status: "active", planId, updatedAt: new Date() })
      .where(eq(membership.id, membershipId));

    this.logger.log(`Membership for user ${userId} activated until ${endAt ?? "permanent"}`);
    return { startDate: startAt, endDate: endAt, isActive: true };
  }

  /** 当前有效 end = 所有 active period 的最大 end_at; 存在永久 period 时为 null */
  private async computeEffectiveEnd(
    membershipId: string,
    db: DbType = this.db,
  ): Promise<Date | null> {
    const periods = await db
      .select()
      .from(membershipPeriod)
      .where(
        and(eq(membershipPeriod.membershipId, membershipId), eq(membershipPeriod.status, "active")),
      );
    if (periods.length === 0) return null;
    if (periods.some((p) => p.endAt == null)) return null; // 永久
    let maxEnd = periods[0].endAt!;
    for (const p of periods) {
      if (p.endAt && p.endAt > maxEnd) maxEnd = p.endAt;
    }
    return maxEnd;
  }

  private async hasActivePeriod(membershipId: string, db: DbType = this.db): Promise<boolean> {
    const periods = await db
      .select({ id: membershipPeriod.id })
      .from(membershipPeriod)
      .where(
        and(eq(membershipPeriod.membershipId, membershipId), eq(membershipPeriod.status, "active")),
      );
    return periods.length > 0;
  }

  /**
   * 创建订单记录。
   * 金额以服务端 DB plans.price_fen 为唯一可信来源 (不接受客户端金额)。
   * 支持幂等: 同用户 + 同 idempotencyKey 返回同一订单。
   */
  async createOrder(input: {
    userId: string;
    planId: string;
    provider: string;
    providerOrderId: string;
    idempotencyKey?: string;
    /** 可选覆盖 (仅测试/内部使用; 正常链路由 DB plan.price_fen 派生, controller 不传) */
    amountFen?: number;
  }) {
    const plan = await this.getPlan(input.planId);
    if (!plan) {
      throw new BadRequestException(`Invalid planId: ${input.planId}`);
    }
    if (!plan.isActive) {
      throw new BadRequestException(`Plan ${input.planId} is not available`);
    }

    const amountFen = input.amountFen ?? plan.priceFen;

    const [inserted] = await this.db
      .insert(orders)
      .values({
        userId: input.userId,
        planId: input.planId,
        amountFen,
        status: "pending",
        provider: input.provider,
        providerOrderId: input.providerOrderId,
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      })
      .onConflictDoNothing({ target: [orders.userId, orders.idempotencyKey] })
      .returning();

    if (inserted) return inserted;

    // 幂等冲突: 返回已有订单
    const existing = await this.db.query.orders.findFirst({
      where: and(eq(orders.userId, input.userId), eq(orders.idempotencyKey, input.idempotencyKey)),
    });
    return existing!;
  }

  async findOrder(orderId: string) {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId));
    return order;
  }

  async findOrderByProviderOrderId(providerOrderId: string) {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.providerOrderId, providerOrderId));
    return order;
  }

  /**
   * markOrderPaid 的 providerOrderId 版本 (mock-pay 页使用)
   */
  async markPaidByProviderOrderId(providerOrderId: string) {
    const order = await this.findOrderByProviderOrderId(providerOrderId);
    if (order) {
      await this.markOrderPaid(order.id);
    }
  }

  /**
   * 订单支付成功后的业务动作: 开通/延长会员 + 金币流水留痕
   */
  async markOrderPaid(orderId: string) {
    await this.db.transaction(async (tx) => {
      // 行锁: 并发下只有一个事务能读到 pending 并推进到 paid
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
      // 幂等: 只有 pending 可转 paid; 已 paid/refunded/cancelled 直接返回
      if (!order || order.status !== OrderStatus.PENDING) return;

      await tx
        .update(orders)
        .set({ status: OrderStatus.PAID, paidAt: new Date(), updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      const plan = await this.getPlan(order.planId, tx);
      if (plan) {
        await this.activateForDays(order.userId, plan.durationDays, plan.id, order.id, tx);
      }

      // 金币流水留痕 (不加减金币, amount=0)
      await tx.insert(coinTransactions).values({
        userId: order.userId,
        amount: 0,
        reason: "membership_purchase",
        relatedId: orderId,
      });

      // 支付成功后生成 Partner 佣金 (若该用户被归因)
      await this.partnerService.generateCommissionForOrder(order, tx);
    });
  }

  /**
   * 退款: 仅 paid -> refunded, 并记录 refunded_at。
   * refunded 后不能再次激活会员 (markOrderPaid 只处理 pending)。
   * 同时撤销本订单产生的会员权益 (减少 end_date 对应天数)。
   */
  async refundOrder(orderId: string) {
    return await this.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
      if (!order) {
        throw new NotFoundException(`Order ${orderId} not found`);
      }
      if (order.status !== OrderStatus.PAID) {
        throw new BadRequestException("Only paid orders can be refunded");
      }

      const [updated] = await tx
        .update(orders)
        .set({ status: OrderStatus.REFUNDED, refundedAt: new Date(), updatedAt: new Date() })
        .where(eq(orders.id, orderId))
        .returning();

      // 精确撤销本订单产生的会员权益 period
      await this.revokePeriodByOrderId(order.id, tx);

      // 撤销本订单产生的佣金 (pending/paid → reversed)
      await this.partnerService.reverseCommissionForOrder(order.id, tx);

      return updated;
    });
  }

  /**
   * 通过 order_id 精确撤销该订单产生的权益 period, 并重算会员有效 end。
   * 永久会员 period (end_at=null) 同样会被标记 revoked。
   */
  private async revokePeriodByOrderId(orderId: string, tx?: DbType) {
    const db = tx ?? this.db;
    const [period] = await db
      .select()
      .from(membershipPeriod)
      .where(eq(membershipPeriod.orderId, orderId))
      .for("update");
    if (!period) return; // 无 period (历史数据未回填), 跳过

    await db
      .update(membershipPeriod)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(eq(membershipPeriod.id, period.id));

    const membershipId = period.membershipId;
    const newEffectiveEnd = await this.computeEffectiveEnd(membershipId, db);
    const active = await this.hasActivePeriod(membershipId, db);
    await db
      .update(membership)
      .set({
        end_date: newEffectiveEnd,
        status: active ? "active" : "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(membership.id, membershipId));
  }

  async getMembershipDetails(userId: string) {
    const result = await this.db.query.membership.findFirst({
      columns: {
        end_date: true,
        type: true,
        start_date: true,
      },
      where: and(eq(membership.userId, userId), eq(membership.status, "active")),
    });

    if (!result) return;

    return {
      startDate: result.start_date,
      endDate: result.end_date,
      type: result.type,
    };
  }

  public async isFounderMembership(userId: string) {
    // 创始会员永久有效 所以不需要检查 active
    const result = await this.db.query.membership.findFirst({
      where: and(eq(membership.userId, userId), eq(membership.type, MembershipType.FOUNDER)),
    });

    return Boolean(result);
  }

  @Cron("0 0 * * *")
  async deactivateExpiredMemberships(currentDate: Date) {
    this.logger.log("Running scheduled task to deactivate expired memberships");
    try {
      await this.db
        .update(membership)
        .set({
          isActive: false,
        })
        .where(and(eq(membership.isActive, true), lt(membership.end_date, currentDate)));

      this.logger.log(`Deactivated expired memberships`);
    } catch (error) {
      this.logger.error("Failed to deactivate expired memberships", error.stack);
    }
  }
}
