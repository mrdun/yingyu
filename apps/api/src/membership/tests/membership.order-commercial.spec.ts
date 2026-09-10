import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";

import { membership, orders, planEntitlements, plans, user } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { MembershipService } from "../membership.service";
import { OrderStatus } from "../types/order-status";

async function seedPlans(db: DbType) {
  const rows = [
    { id: "monthly", name: "月度会员", priceFen: 1800, durationDays: 30 },
    { id: "quarterly", name: "季度会员", priceFen: 4800, durationDays: 90 },
    { id: "yearly", name: "年度会员", priceFen: 16800, durationDays: 365 },
  ] as const;
  for (const p of rows) {
    await db.insert(plans).values({
      id: p.id,
      name: p.name,
      priceFen: p.priceFen,
      durationDays: p.durationDays,
      sortOrder: 1,
    });
  }
}

async function seedUsers(db: DbType) {
  for (const id of ["u-1", "u-2", "u-3", "u-4", "u-5", "u-6"]) {
    await db.insert(user).values({ id }).onConflictDoNothing();
  }
}

describe("Orders commercial model", () => {
  let db: DbType;
  let service: MembershipService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [MembershipService],
    }).compile();
    db = module.get<DbType>(DB);
    service = module.get<MembershipService>(MembershipService);
  });

  beforeEach(async () => {
    await cleanDB(db);
    await db.delete(planEntitlements);
    await db.delete(plans);
    await seedPlans(db);
    await seedUsers(db);
  });

  afterAll(async () => {
    await cleanDB(db);
    await db.delete(planEntitlements);
    await db.delete(plans);
    await db.delete(user);
    await endDB();
  });

  it("creates an order linked to a plan", async () => {
    const order = await service.createOrder({
      userId: "u-1",
      planId: "monthly",
      amountFen: 1800,
      provider: "mock",
      providerOrderId: "mock_a1",
    });
    expect(order.planId).toBe("monthly");
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.currency).toBe("CNY");
  });

  it("markOrderPaid activates membership exactly once (idempotent)", async () => {
    const order = await service.createOrder({
      userId: "u-2",
      planId: "yearly",
      amountFen: 16800,
      provider: "mock",
      providerOrderId: "mock_b1",
    });

    await service.markOrderPaid(order.id);
    await service.markOrderPaid(order.id);

    const rows = await db.select().from(membership).where(eq(membership.userId, "u-2"));
    expect(rows).toHaveLength(1);
  });

  it("enforces unique provider_order_id", async () => {
    await service.createOrder({
      userId: "u-3",
      planId: "monthly",
      amountFen: 1800,
      provider: "mock",
      providerOrderId: "mock_c1",
    });
    await expect(
      service.createOrder({
        userId: "u-3",
        planId: "monthly",
        amountFen: 1800,
        provider: "mock",
        providerOrderId: "mock_c1",
      }),
    ).rejects.toThrow();
  });

  it("refunds a paid order", async () => {
    const order = await service.createOrder({
      userId: "u-4",
      planId: "monthly",
      amountFen: 1800,
      provider: "mock",
      providerOrderId: "mock_d1",
    });
    await service.markOrderPaid(order.id);

    const refunded = await service.refundOrder(order.id);
    expect(refunded.status).toBe(OrderStatus.REFUNDED);
    expect(refunded.refundedAt).toBeTruthy();
  });

  it("rejects refunding a pending order", async () => {
    const order = await service.createOrder({
      userId: "u-5",
      planId: "monthly",
      amountFen: 1800,
      provider: "mock",
      providerOrderId: "mock_e1",
    });
    await expect(service.refundOrder(order.id)).rejects.toThrow();
  });

  it("does not activate a failed order", async () => {
    const order = await service.createOrder({
      userId: "u-6",
      planId: "monthly",
      amountFen: 1800,
      provider: "mock",
      providerOrderId: "mock_f1",
    });
    await db.update(orders).set({ status: OrderStatus.FAILED }).where(eq(orders.id, order.id));

    await service.markOrderPaid(order.id);
    expect(await service.isMember("u-6")).toBe(false);
  });
});
