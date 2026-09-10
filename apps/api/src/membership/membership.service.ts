import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { and, eq, lt } from "drizzle-orm";

import { coinTransactions, membership, orders } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";
import { BuyMembershipDto, MembershipPeriod } from "./dto/buy-membership.dto";
import { findPlan } from "./plans";
import { MembershipType } from "./types/membership.types";

@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);
  constructor(@Inject(DB) private db: DbType) {}

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

  private async findMembership(userId: string) {
    const result = await this.db.select().from(membership).where(eq(membership.userId, userId));
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

  async isMember(userId: string): Promise<boolean> {
    const result = await this.db.query.membership.findFirst({
      where: eq(membership.userId, userId),
    });

    if (!result) return false;

    // 永久会员 (创始会员) 始终有效
    if (result.type === MembershipType.FOUNDER) return true;

    // 普通会员: 未过期 (end_date > 当前时间), 不依赖 isActive 字段
    return result.end_date > new Date();
  }

  /**
   * 当前用户会员状态 (供 /membership/status 与 /membership/my)
   */
  async getMembershipStatus(userId: string) {
    const result = await this.db.query.membership.findFirst({
      where: eq(membership.userId, userId),
    });

    const isMember = Boolean(result?.isActive && result.end_date > new Date());
    return {
      isMember,
      type: result?.type ?? null,
      startDate: isMember ? result.start_date : null,
      endDate: isMember ? result.end_date : null,
    };
  }

  /**
   * 按天数开通/延长会员 (供订单支付成功回调使用)
   */
  async activateForDays(userId: string, durationDays: number) {
    const now = new Date();
    const membershipEntity = await this.findMembership(userId);
    const active = membershipEntity && membershipEntity.isActive && membershipEntity.end_date > now;

    let startDate: Date;
    let endDate: Date;
    if (active) {
      startDate = membershipEntity.start_date;
      endDate = new Date(membershipEntity.end_date);
      endDate.setDate(endDate.getDate() + durationDays);
      await this.db
        .update(membership)
        .set({ end_date: endDate })
        .where(eq(membership.userId, userId));
      this.logger.log(`Membership for user ${userId} extended to ${endDate}`);
    } else {
      startDate = now;
      endDate = new Date(now);
      endDate.setDate(endDate.getDate() + durationDays);
      if (!membershipEntity) {
        await this.db.insert(membership).values({
          userId,
          start_date: startDate,
          end_date: endDate,
          isActive: true,
        });
      } else {
        await this.db
          .update(membership)
          .set({ start_date: startDate, end_date: endDate, isActive: true })
          .where(eq(membership.userId, userId));
      }
    }
    return { startDate, endDate, isActive: true };
  }

  /**
   * 创建订单记录
   */
  async createOrder(input: {
    userId: string;
    planId: string;
    amountFen: number;
    provider: string;
    providerOrderId: string;
  }) {
    const [order] = await this.db
      .insert(orders)
      .values({
        userId: input.userId,
        planId: input.planId,
        amountFen: input.amountFen,
        status: "pending",
        provider: input.provider,
        providerOrderId: input.providerOrderId,
      })
      .returning();
    return order;
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
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId));
    if (!order || order.status === "paid") return;

    await this.db
      .update(orders)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(orders.id, orderId));

    const plan = findPlan(order.planId);
    if (plan) {
      await this.activateForDays(order.userId, plan.durationDays);
    }

    // 金币流水留痕 (不加减金币, amount=0)
    await this.db.insert(coinTransactions).values({
      userId: order.userId,
      amount: 0,
      reason: "membership_purchase",
      relatedId: orderId,
    });
  }

  async getMembershipDetails(userId: string) {
    const result = await this.db.query.membership.findFirst({
      columns: {
        end_date: true,
        type: true,
        start_date: true,
      },
      where: and(eq(membership.userId, userId), eq(membership.isActive, true)),
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
