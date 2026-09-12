import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { DbType } from "src/global/providers/db.provider";

import { coinTransactions, membership, orders, plans, user } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB } from "../../global/providers/db.provider";
import { PartnerService } from "../../partner/partner.service";
import { MockPaymentProvider } from "../../payment/mock-payment.provider";
import { PAYMENT_PROVIDER } from "../../payment/payment-provider.interface";
import { MembershipService } from "../membership.service";
import { MEMBERSHIP_PLANS } from "../plans";

async function seedPlans(db: DbType) {
  const rows = [
    { id: "monthly", priceFen: 1800, durationDays: 30 },
    { id: "quarterly", priceFen: 4800, durationDays: 90 },
    { id: "yearly", priceFen: 16800, durationDays: 365 },
  ] as const;
  for (const p of rows) {
    await db
      .insert(plans)
      .values({
        id: p.id,
        name: p.id,
        priceFen: p.priceFen,
        durationDays: p.durationDays,
        sortOrder: 1,
      });
  }
}

async function seedUsers(db: DbType) {
  for (const id of ["user-1", "user-2", "user-3", "user-4"]) {
    await db.insert(user).values({ id }).onConflictDoNothing();
  }
}

describe("Membership orders (mock payment)", () => {
  let service: MembershipService;
  let provider: MockPaymentProvider;
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
    provider = module.get<MockPaymentProvider>(PAYMENT_PROVIDER);
  });

  beforeEach(async () => {
    await cleanDB(db);
    await db.delete(plans);
    await seedPlans(db);
    await seedUsers(db);
  });

  afterAll(async () => {
    await cleanDB(db);
    await db.delete(plans);
    await db.delete(user);
    await endDB();
  });

  it("should export three plans with correct prices", () => {
    expect(MEMBERSHIP_PLANS.map((p) => p.id)).toEqual(["monthly", "quarterly", "yearly"]);
    const byId = Object.fromEntries(MEMBERSHIP_PLANS.map((p) => [p.id, p]));
    expect(byId.monthly.priceFen).toBe(1800);
    expect(byId.monthly.durationDays).toBe(30);
    expect(byId.quarterly.priceFen).toBe(4800);
    expect(byId.quarterly.durationDays).toBe(90);
    expect(byId.yearly.priceFen).toBe(16800);
    expect(byId.yearly.durationDays).toBe(365);
  });

  it("should create a pending order", async () => {
    const order = await service.createOrder({
      userId: "user-1",
      planId: "monthly",
      amountFen: 1800,
      provider: "mock",
      providerOrderId: "mock_x1",
    });
    expect(order.status).toBe("pending");
    expect(order.amountFen).toBe(1800);
    expect(order.provider).toBe("mock");
  });

  it("markOrderPaid should activate membership and write coin transaction once (idempotent)", async () => {
    const order = await service.createOrder({
      userId: "user-2",
      planId: "yearly",
      amountFen: 16800,
      provider: "mock",
      providerOrderId: "mock_x2",
    });

    await service.markOrderPaid(order.id);

    const paid = await service.findOrder(order.id);
    expect(paid.status).toBe("paid");
    expect(paid.paidAt).toBeTruthy();

    const isMember = await service.isMember("user-2");
    expect(isMember).toBe(true);

    const detail = await service.getMembershipStatus("user-2");
    expect(detail.isMember).toBe(true);
    expect(detail.endDate).toBeTruthy();

    const [tx] = await db
      .select()
      .from(coinTransactions)
      .where(eq(coinTransactions.userId, "user-2"));
    expect(tx.reason).toBe("membership_purchase");
    expect(tx.amount).toBe(0);
    expect(tx.relatedId).toBe(order.id);

    // 幂等: 再次调用不应重复写流水/延期
    await service.markOrderPaid(order.id);
    const txs = await db
      .select()
      .from(coinTransactions)
      .where(eq(coinTransactions.userId, "user-2"));
    expect(txs.length).toBe(1);
  });

  it("stacked orders extend the membership end date", async () => {
    const now = new Date();
    const order1 = await service.createOrder({
      userId: "user-3",
      planId: "monthly",
      amountFen: 1800,
      provider: "mock",
      providerOrderId: "mock_ext1",
    });
    await service.markOrderPaid(order1.id);
    const first = await service.getMembershipStatus("user-3");
    expect(first.isMember).toBe(true);

    const order2 = await service.createOrder({
      userId: "user-3",
      planId: "quarterly",
      amountFen: 4800,
      provider: "mock",
      providerOrderId: "mock_ext2",
    });
    await service.markOrderPaid(order2.id);
    const second = await service.getMembershipStatus("user-3");
    const firstEnd = new Date(first.endDate).getTime();
    const secondEnd = new Date(second.endDate).getTime();
    expect(secondEnd - firstEnd).toBeGreaterThanOrEqual(90 * 24 * 3600 * 1000 - 1000);
    expect(new Date(now).getTime()).toBeLessThan(secondEnd);
  });

  it("mock provider queryPayment: pending before 10s, then paid; order state machine transitions", async () => {
    const created = await provider.createPayment({
      id: "o_tmp",
      userId: "user-4",
      planId: "monthly",
      amountFen: 1800,
      currency: "CNY",
      providerOrderId: null,
    });
    expect(created.providerOrderId).toContain("mock_");

    const order = await service.createOrder({
      userId: "user-4",
      planId: "monthly",
      amountFen: 1800,
      provider: "mock",
      providerOrderId: created.providerOrderId,
    });
    const orderCtx = {
      id: order.id,
      userId: "user-4",
      planId: "monthly",
      amountFen: 1800,
      currency: "CNY",
      providerOrderId: created.providerOrderId,
    };

    // 立即查询: pending
    let q = await provider.queryPayment(orderCtx);
    expect(q.status).toBe("pending");
    expect((await service.findOrder(order.id)).status).toBe("pending");

    // 时间快进超过 10s: provider 返回 paid
    const createdAt = (provider as any).orders.get(created.providerOrderId) as number;
    (provider as any).orders.set(created.providerOrderId, createdAt - 11_000);
    q = await provider.queryPayment(orderCtx);
    expect(q.status).toBe("paid");

    // 模拟回调: 置 paid + 开通会员
    await service.markPaidByProviderOrderId(created.providerOrderId);
    const updated = await service.findOrder(order.id);
    expect(updated.status).toBe("paid");
    expect(await service.isMember("user-4")).toBe(true);

    // 不存在的订单 -> failed
    expect(
      (await provider.queryPayment({ ...orderCtx, providerOrderId: "mock_missing" })).status,
    ).toBe("failed");
  });
});
