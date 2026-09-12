import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";

import { membership, membershipPeriod, orders, plans, user } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { PartnerService } from "../../partner/partner.service";
import { MockPaymentProvider } from "../../payment/mock-payment.provider";
import { PAYMENT_PROVIDER } from "../../payment/payment-provider.interface";
import { MembershipService } from "../membership.service";

async function seedPlans(db: DbType) {
  const rows = [
    { id: "monthly", name: "月度会员", priceFen: 1800, durationDays: 30 },
    { id: "lifetime", name: "永久会员", priceFen: 19900, durationDays: null },
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

describe("MembershipService order production (lifetime / amount / idempotency)", () => {
  let service: MembershipService;
  let db: DbType;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [
        MembershipService,
        PartnerService,
        { provide: PAYMENT_PROVIDER, useClass: MockPaymentProvider },
      ],
    }).compile();
    db = module.get<DbType>(DB);
    service = module.get<MembershipService>(MembershipService);
  });

  beforeEach(async () => {
    await cleanDB(db);
    await db.delete(plans);
    await seedPlans(db);
    await db.insert(user).values({ id: "u1" }).onConflictDoNothing();
  });

  afterAll(async () => {
    await cleanDB(db);
    await db.delete(plans);
    await db.delete(user);
    await endDB();
  });

  it("derives order amount from DB plan price (not client)", async () => {
    const order = await service.createOrder({
      userId: "u1",
      planId: "monthly",
      provider: "mock",
      providerOrderId: "mock_amt",
    });
    expect(order.amountFen).toBe(1800);
  });

  it("activates a lifetime plan as a permanent membership period", async () => {
    const order = await service.createOrder({
      userId: "u1",
      planId: "lifetime",
      provider: "mock",
      providerOrderId: "mock_lifetime",
    });

    await service.markOrderPaid(order.id);

    const [period] = await db
      .select()
      .from(membershipPeriod)
      .where(eq(membershipPeriod.orderId, order.id));
    expect(period.endAt).toBeNull();

    const [m] = await db.select().from(membership).where(eq(membership.userId, "u1"));
    expect(m.status).toBe("active");
    expect(m.end_date).toBeNull();
    expect(await service.isMember("u1")).toBe(true);
  });

  it("rejects an inactive plan", async () => {
    await db.update(plans).set({ isActive: false }).where(eq(plans.id, "monthly"));
    await expect(
      service.createOrder({
        userId: "u1",
        planId: "monthly",
        provider: "mock",
        providerOrderId: "mock_inactive",
      }),
    ).rejects.toThrow();
  });

  it("returns the same order for the same idempotency key", async () => {
    const first = await service.createOrder({
      userId: "u1",
      planId: "monthly",
      provider: "mock",
      providerOrderId: "mock_idem_a",
      idempotencyKey: "client-key-1",
    });
    const second = await service.createOrder({
      userId: "u1",
      planId: "monthly",
      provider: "mock",
      providerOrderId: "mock_idem_b",
      idempotencyKey: "client-key-1",
    });
    expect(second.id).toBe(first.id);

    const all = await db.select().from(orders).where(eq(orders.userId, "u1"));
    expect(all).toHaveLength(1);
  });

  it("mock payment provider is disabled in production", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "prod";
    try {
      const provider = new MockPaymentProvider();
      await expect(
        provider.createPayment({
          id: "o1",
          userId: "u1",
          planId: "monthly",
          amountFen: 1800,
          currency: "CNY",
          providerOrderId: null,
        }),
      ).rejects.toThrow();
    } finally {
      if (original === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = original;
    }
  });

  it("admin grant grants lifetime without creating an order", async () => {
    const result = await service.grantMembership("u1", "lifetime");
    expect(result.endDate).toBeNull();

    const [m] = await db.select().from(membership).where(eq(membership.userId, "u1"));
    expect(m.planId).toBe("lifetime");
    expect(m.end_date).toBeNull();

    const allOrders = await db.select().from(orders).where(eq(orders.userId, "u1"));
    expect(allOrders).toHaveLength(0);
  });

  it("admin grant rejects an invalid plan", async () => {
    await expect(service.grantMembership("u1", "nonexistent")).rejects.toThrow();
  });
});
