import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { DbType } from "src/global/providers/db.provider";

import { coinTransactions, membership, orders } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB } from "../../global/providers/db.provider";
import { MockPaymentProvider } from "../../payment/mock-payment.provider";
import { PAYMENT_PROVIDER } from "../../payment/payment-provider.interface";
import { MembershipService } from "../membership.service";
import { MEMBERSHIP_PLANS } from "../plans";

describe("Membership orders (mock payment)", () => {
  let service: MembershipService;
  let provider: MockPaymentProvider;
  let db: DbType;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [MembershipService, { provide: PAYMENT_PROVIDER, useClass: MockPaymentProvider }],
    }).compile();

    db = module.get<DbType>(DB);
    service = module.get<MembershipService>(MembershipService);
    provider = module.get<MockPaymentProvider>(PAYMENT_PROVIDER);
  });

  beforeEach(async () => {
    await cleanDB(db);
  });

  afterAll(async () => {
    await cleanDB(db);
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

  it("activateForDays should extend an active membership", async () => {
    const now = new Date();
    await service.activateForDays("user-3", 30);
    const first = await service.getMembershipStatus("user-3");
    expect(first.isMember).toBe(true);

    await service.activateForDays("user-3", 90);
    const second = await service.getMembershipStatus("user-3");
    const firstEnd = new Date(first.endDate).getTime();
    const secondEnd = new Date(second.endDate).getTime();
    expect(secondEnd - firstEnd).toBeGreaterThanOrEqual(90 * 24 * 3600 * 1000 - 1000);
    expect(new Date(now).getTime()).toBeLessThan(secondEnd);
  });

  it("mock provider queryOrder: pending before 10s, then paid; order state machine transitions", async () => {
    const created = await provider.createOrder("user-4", "monthly");
    expect(created.payUrl).toContain("/membership/mock-pay/");
    expect(created.payUrl).toContain("?confirm=1");

    const order = await service.createOrder({
      userId: "user-4",
      planId: "monthly",
      amountFen: 1800,
      provider: "mock",
      providerOrderId: created.orderId,
    });

    // 立即查询: pending
    let q = await provider.queryOrder(created.orderId);
    expect(q.status).toBe("pending");
    expect((await service.findOrder(order.id)).status).toBe("pending");

    // 时间快进超过 10s: provider 返回 paid
    const createdAt = (provider as any).orders.get(created.orderId) as number;
    (provider as any).orders.set(created.orderId, createdAt - 11_000);
    q = await provider.queryOrder(created.orderId);
    expect(q.status).toBe("paid");

    // 模拟回调: 置 paid + 开通会员
    await service.markPaidByProviderOrderId(created.orderId);
    const updated = await service.findOrder(order.id);
    expect(updated.status).toBe("paid");
    expect(await service.isMember("user-4")).toBe(true);

    // 不存在的订单 -> failed
    expect((await provider.queryOrder("mock_missing")).status).toBe("failed");
  });
});
