import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";

import {
  commissionRecord,
  membership,
  orders,
  partner,
  plans,
  referral,
  user,
} from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { DashboardController } from "../dashboard.controller";
import { DashboardService } from "../dashboard.service";

describe("DashboardService", () => {
  let db: DbType;
  let service: DashboardService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [DashboardService],
      controllers: [DashboardController],
    }).compile();
    db = module.get<DbType>(DB);
    service = module.get<DashboardService>(DashboardService);
  });

  beforeEach(async () => {
    await cleanDB(db);
    await db.delete(commissionRecord);
    await db.delete(referral);
    await db.delete(partner);
    await db.delete(orders);
    await db.delete(membership);
    await db.delete(plans);
    await db.delete(user);
  });

  afterAll(async () => {
    await cleanDB(db);
    await endDB();
  });

  async function seed() {
    await db.insert(plans).values([
      { id: "monthly", name: "月度会员", priceFen: 1800, durationDays: 30, sortOrder: 1 },
      { id: "lifetime", name: "永久会员", priceFen: 19900, durationDays: null, sortOrder: 4 },
    ]);
    await db.insert(user).values([{ id: "u1" }, { id: "u2" }, { id: "p1" }]);
    await db.insert(orders).values([
      {
        id: "o1",
        userId: "u1",
        planId: "monthly",
        amountFen: 1800,
        status: "paid",
        paidAt: new Date(),
      },
      {
        id: "o2",
        userId: "u2",
        planId: "monthly",
        amountFen: 1800,
        status: "refunded",
        refundedAt: new Date(),
      },
      {
        id: "o3",
        userId: "u1",
        planId: "lifetime",
        amountFen: 19900,
        status: "paid",
        paidAt: new Date(),
      },
      { id: "o4", userId: "u2", planId: "monthly", amountFen: 1800, status: "pending" },
    ]);
    await db
      .insert(membership)
      .values([
        {
          userId: "u1",
          start_date: new Date(),
          end_date: null,
          status: "active",
          planId: "lifetime",
          type: "regular",
        },
      ]);
    await db
      .insert(partner)
      .values([{ id: "pt1", userId: "p1", status: "active", referralCode: "rc1" }]);
    await db
      .insert(referral)
      .values([{ referrerId: "p1", referredUserId: "u1", referralCode: "rc1" }]);
    await db.insert(commissionRecord).values([
      {
        partnerUserId: "p1",
        referredUserId: "u1",
        orderId: "o1",
        orderAmountFen: 1800,
        rate: 0.4,
        rateBps: 4000,
        commissionFen: 720,
        status: "pending",
      },
    ]);
  }

  it("computes revenue, orders, memberships and partners overview", async () => {
    await seed();
    const res = await service.getOverview();

    expect(res.revenue.totalFen).toBe(1800 + 19900);
    expect(res.revenue.refundFen).toBe(1800);
    expect(res.revenue.netRevenueFen).toBe(1800 + 19900 - 1800);
    expect(res.orders.paidCount).toBe(2);
    expect(res.orders.refundedCount).toBe(1);
    expect(res.orders.pendingCount).toBe(1);
    expect(res.memberships.activeCount).toBe(1);
    expect(res.memberships.lifetimeCount).toBe(1);
    expect(res.partners.activePartners).toBe(1);
    expect(res.partners.commissionPendingFen).toBe(720);
  });

  it("filters and paginates orders", async () => {
    await seed();
    const paid = await service.listOrders({ status: "paid", page: 1, limit: 10 });
    expect(paid.total).toBe(2);
    expect(paid.items.every((o) => o.status === "paid")).toBe(true);

    const page = await service.listOrders({ page: 1, limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(4);
  });

  it("computes partner stats with commission summary", async () => {
    await seed();
    const res = await service.getPartnerStats();
    expect(res.activePartners).toBe(1);
    expect(res.referrals.total).toBe(1);
    expect(res.commission.pendingFen).toBe(720);
    expect(res.commission.totalFen).toBe(720);
  });

  it("dashboard endpoints require admin:access", () => {
    for (const method of ["overview", "orders", "memberships", "partners"]) {
      const permissions = Reflect.getMetadata(
        "permissions",
        (DashboardController.prototype as any)[method],
      );
      expect(permissions).toEqual(["admin:access"]);
    }
  });
});
