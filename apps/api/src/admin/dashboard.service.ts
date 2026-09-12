import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, gte, lte, sql } from "drizzle-orm";

import { commissionRecord, membership, orders, partner, plans, referral } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";
import { OrderStatus } from "../membership/types/order-status";

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfMonth(d: Date): Date {
  const r = new Date(d);
  r.setDate(1);
  r.setHours(0, 0, 0, 0);
  return r;
}

@Injectable()
export class DashboardService {
  constructor(@Inject(DB) private db: DbType) {}

  async getOverview() {
    const now = new Date();
    const today = startOfDay(now);
    const yesterday = startOfDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    const month = startOfMonth(now);

    const sumFen = (where?: ReturnType<typeof and>) =>
      this.db
        .select({ total: sql<number>`coalesce(sum(${orders.amountFen}), 0)` })
        .from(orders)
        .where(where);

    const countOrders = (where?: ReturnType<typeof and>) =>
      this.db.select({ total: count() }).from(orders).where(where);

    const countMembers = (where?: ReturnType<typeof and>) =>
      this.db.select({ total: count() }).from(membership).where(where);

    const [
      paidTotal,
      paidToday,
      paidYesterday,
      paidMonth,
      refundTotal,
      ordersToday,
      ordersMonth,
      paidCount,
      refundedCount,
      pendingCount,
      activeMembers,
      lifetimeMembers,
      newMembersToday,
      newMembersMonth,
      activePartners,
      referralsToday,
      referralsMonth,
      commissionPending,
      commissionTotal,
    ] = await Promise.all([
      sumFen(eq(orders.status, OrderStatus.PAID)),
      sumFen(and(eq(orders.status, OrderStatus.PAID), gte(orders.createdAt, today))),
      sumFen(
        and(
          eq(orders.status, OrderStatus.PAID),
          gte(orders.createdAt, yesterday),
          lte(orders.createdAt, today),
        ),
      ),
      sumFen(and(eq(orders.status, OrderStatus.PAID), gte(orders.createdAt, month))),
      sumFen(eq(orders.status, OrderStatus.REFUNDED)),
      countOrders(gte(orders.createdAt, today)),
      countOrders(gte(orders.createdAt, month)),
      countOrders(eq(orders.status, OrderStatus.PAID)),
      countOrders(eq(orders.status, OrderStatus.REFUNDED)),
      countOrders(eq(orders.status, OrderStatus.PENDING)),
      countMembers(eq(membership.status, "active")),
      countMembers(and(eq(membership.status, "active"), eq(membership.planId, "lifetime"))),
      countMembers(gte(membership.createdAt, today)),
      countMembers(gte(membership.createdAt, month)),
      this.db.select({ total: count() }).from(partner).where(eq(partner.status, "active")),
      this.db.select({ total: count() }).from(referral).where(gte(referral.createdAt, today)),
      this.db.select({ total: count() }).from(referral).where(gte(referral.createdAt, month)),
      this.db
        .select({ total: sql<number>`coalesce(sum(${commissionRecord.commissionFen}), 0)` })
        .from(commissionRecord)
        .where(eq(commissionRecord.status, "pending")),
      this.db
        .select({ total: sql<number>`coalesce(sum(${commissionRecord.commissionFen}), 0)` })
        .from(commissionRecord)
        .where(sql`${commissionRecord.status} <> 'reversed'`),
    ]);

    const totalFen = Number(paidTotal[0]?.total ?? 0);
    const refundFen = Number(refundTotal[0]?.total ?? 0);

    return {
      revenue: {
        todayFen: Number(paidToday[0]?.total ?? 0),
        yesterdayFen: Number(paidYesterday[0]?.total ?? 0),
        monthFen: Number(paidMonth[0]?.total ?? 0),
        totalFen,
        refundFen,
        netRevenueFen: totalFen - refundFen,
      },
      orders: {
        todayCount: Number(ordersToday[0]?.total ?? 0),
        monthCount: Number(ordersMonth[0]?.total ?? 0),
        paidCount: Number(paidCount[0]?.total ?? 0),
        refundedCount: Number(refundedCount[0]?.total ?? 0),
        pendingCount: Number(pendingCount[0]?.total ?? 0),
      },
      memberships: {
        activeCount: Number(activeMembers[0]?.total ?? 0),
        lifetimeCount: Number(lifetimeMembers[0]?.total ?? 0),
        newToday: Number(newMembersToday[0]?.total ?? 0),
        newMonth: Number(newMembersMonth[0]?.total ?? 0),
      },
      partners: {
        activePartners: Number(activePartners[0]?.total ?? 0),
        referralsToday: Number(referralsToday[0]?.total ?? 0),
        referralsMonth: Number(referralsMonth[0]?.total ?? 0),
        commissionPendingFen: Number(commissionPending[0]?.total ?? 0),
        commissionTotalFen: Number(commissionTotal[0]?.total ?? 0),
      },
    };
  }

  async listOrders(params: {
    status?: string;
    provider?: string;
    planId?: string;
    userId?: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const offset = (page - 1) * limit;

    const conditions = [];
    if (params.status) conditions.push(eq(orders.status, params.status));
    if (params.provider) conditions.push(eq(orders.provider, params.provider));
    if (params.planId) conditions.push(eq(orders.planId, params.planId));
    if (params.userId) conditions.push(eq(orders.userId, params.userId));
    if (params.from) conditions.push(gte(orders.createdAt, params.from));
    if (params.to) conditions.push(lte(orders.createdAt, params.to));
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await this.db
      .select({
        orderId: orders.id,
        userId: orders.userId,
        planName: plans.name,
        amountFen: orders.amountFen,
        status: orders.status,
        provider: orders.provider,
        createdAt: orders.createdAt,
        paidAt: orders.paidAt,
        refundedAt: orders.refundedAt,
      })
      .from(orders)
      .leftJoin(plans, eq(plans.id, orders.planId))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await this.db.select({ total: count() }).from(orders).where(where);

    return {
      items: rows,
      total: Number(totalRow?.total ?? 0),
      page,
      limit,
    };
  }

  async getMembershipGrowth(from: Date, to: Date) {
    const rows = await this.db
      .select({
        date: sql<string>`to_char(${membership.createdAt}, 'YYYY-MM-DD')`,
        newMembers: sql<number>`count(*)`,
        lifetimePurchases: sql<number>`count(*) filter (where ${membership.planId} = 'lifetime')`,
        paidUsers: sql<number>`count(distinct ${membership.userId})`,
      })
      .from(membership)
      .where(and(gte(membership.createdAt, from), lte(membership.createdAt, to)))
      .groupBy(sql`to_char(${membership.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(asc(sql`to_char(${membership.createdAt}, 'YYYY-MM-DD')`));

    return {
      daily: rows.map((r) => ({
        date: r.date,
        newMembers: Number(r.newMembers),
        lifetimePurchases: Number(r.lifetimePurchases),
        paidUsers: Number(r.paidUsers),
      })),
    };
  }

  async getPartnerStats() {
    const now = new Date();
    const today = startOfDay(now);
    const month = startOfMonth(now);

    const [
      activePartners,
      referralsTotal,
      referralsToday,
      referralsMonth,
      paidReferralUsers,
      commissionPending,
      commissionPaid,
      commissionReversed,
      commissionTotal,
    ] = await Promise.all([
      this.db.select({ total: count() }).from(partner).where(eq(partner.status, "active")),
      this.db.select({ total: count() }).from(referral),
      this.db.select({ total: count() }).from(referral).where(gte(referral.createdAt, today)),
      this.db.select({ total: count() }).from(referral).where(gte(referral.createdAt, month)),
      this.db
        .select({ total: sql<number>`count(distinct ${commissionRecord.referredUserId})` })
        .from(commissionRecord)
        .where(sql`${commissionRecord.status} <> 'reversed'`),
      this.db
        .select({ total: sql<number>`coalesce(sum(${commissionRecord.commissionFen}), 0)` })
        .from(commissionRecord)
        .where(eq(commissionRecord.status, "pending")),
      this.db
        .select({ total: sql<number>`coalesce(sum(${commissionRecord.commissionFen}), 0)` })
        .from(commissionRecord)
        .where(eq(commissionRecord.status, "paid")),
      this.db
        .select({ total: sql<number>`coalesce(sum(${commissionRecord.commissionFen}), 0)` })
        .from(commissionRecord)
        .where(eq(commissionRecord.status, "reversed")),
      this.db
        .select({ total: sql<number>`coalesce(sum(${commissionRecord.commissionFen}), 0)` })
        .from(commissionRecord),
    ]);

    const totalRefs = Number(referralsTotal[0]?.total ?? 0);
    const paidUsers = Number(paidReferralUsers[0]?.total ?? 0);

    return {
      activePartners: Number(activePartners[0]?.total ?? 0),
      referrals: {
        total: totalRefs,
        today: Number(referralsToday[0]?.total ?? 0),
        month: Number(referralsMonth[0]?.total ?? 0),
      },
      conversion: {
        paidUsers,
        conversionRate: totalRefs ? Math.round((paidUsers / totalRefs) * 100) : 0,
      },
      commission: {
        pendingFen: Number(commissionPending[0]?.total ?? 0),
        paidFen: Number(commissionPaid[0]?.total ?? 0),
        reversedFen: Number(commissionReversed[0]?.total ?? 0),
        totalFen: Number(commissionTotal[0]?.total ?? 0),
      },
    };
  }
}
