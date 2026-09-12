import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";

import { orders, paymentEvent, plans, user } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { PartnerService } from "../../partner/partner.service";
import {
  ClosePaymentResult,
  NormalizedPayment,
  PAYMENT_PROVIDER,
  PAYMENT_PROVIDERS,
  PaymentOrder,
  PaymentProvider,
} from "../../payment/payment-provider.interface";
import { MembershipService } from "../membership.service";
import { OrderStatus } from "../types/order-status";

/** 可编程的渠道桩: 只覆盖关单/查单行为 */
class StubProvider implements PaymentProvider {
  readonly name = "wechat";
  readonly supportedMethods = ["wechat_native"] as const;
  readonly merchantId = "mch";
  readonly configured = true;

  closeResult: ClosePaymentResult = { closed: true };
  closeError?: Error;
  queryResult: NormalizedPayment["status"] = "pending";
  closeCalls = 0;

  async createPayment(order: PaymentOrder) {
    return { providerOrderId: order.id };
  }
  async queryPayment(order: PaymentOrder): Promise<NormalizedPayment> {
    return {
      providerOrderId: order.providerOrderId ?? order.id,
      amountFen: order.amountFen,
      currency: order.currency,
      status: this.queryResult,
      transactionId: this.queryResult === "paid" ? "txn_late" : undefined,
    };
  }
  async closePayment(): Promise<ClosePaymentResult> {
    this.closeCalls++;
    if (this.closeError) throw this.closeError;
    return this.closeResult;
  }
  verifyCallback(): boolean {
    return false;
  }
  parseCallback(): NormalizedPayment {
    throw new Error("not used");
  }
  async refundPayment() {
    return { refunded: true };
  }
  callbackAck() {
    return { contentType: "application/xml", body: "<xml/>" };
  }
}

describe("订单超时关闭 (先关第三方单, 再过期)", () => {
  let service: MembershipService;
  let db: DbType;
  const provider = new StubProvider();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [
        MembershipService,
        PartnerService,
        { provide: PAYMENT_PROVIDER, useValue: provider },
        { provide: PAYMENT_PROVIDERS, useValue: { get: () => provider } },
      ],
    }).compile();
    db = module.get<DbType>(DB);
    service = module.get<MembershipService>(MembershipService);
  });

  beforeEach(async () => {
    provider.closeResult = { closed: true };
    provider.closeError = undefined;
    provider.queryResult = "pending";
    provider.closeCalls = 0;

    await cleanDB(db);
    await db.delete(paymentEvent);
    await db.delete(plans);
    await db.insert(plans).values({
      id: "monthly",
      name: "月度会员",
      priceFen: 1800,
      durationDays: 30,
      sortOrder: 1,
    });
    await db.insert(user).values({ id: "u1" }).onConflictDoNothing();
  });

  afterAll(async () => {
    await cleanDB(db);
    await db.delete(paymentEvent);
    await db.delete(plans);
    await db.delete(user);
    await endDB();
  });

  async function seedPendingOrder(providerOrderId: string | null = "wechat_order_1") {
    return await service.createOrder({
      userId: "u1",
      planId: "monthly",
      provider: "wechat",
      paymentMethod: "wechat_native",
      providerOrderId: providerOrderId ?? undefined,
    });
  }

  it("closes the third-party order before expiring", async () => {
    const order = await seedPendingOrder();
    const result = await service.expireOrder(order.id);

    expect(provider.closeCalls).toBe(1);
    expect(result.status).toBe(OrderStatus.EXPIRED);
    expect((await service.findOrder(order.id)).status).toBe(OrderStatus.EXPIRED);
  });

  it("never expires an order that the provider reports as paid", async () => {
    const order = await seedPendingOrder();
    provider.closeResult = { closed: false, reason: "ORDERPAID" };
    provider.queryResult = "paid";

    const result = await service.expireOrder(order.id);

    expect(result.status).toBe(OrderStatus.PAID);
    const stored = await service.findOrder(order.id);
    expect(stored.status).toBe(OrderStatus.PAID);
    expect(stored.providerTransactionId).toBe("txn_late");
  });

  it("keeps the order pending and records a reconciliation event when close fails", async () => {
    const order = await seedPendingOrder();
    provider.closeError = new Error("network down");

    const result = await service.expireOrder(order.id);

    expect(result).toEqual({ status: OrderStatus.PENDING, reason: "requires_reconciliation" });
    expect((await service.findOrder(order.id)).status).toBe(OrderStatus.PENDING);

    const events = await db.select().from(paymentEvent).where(eq(paymentEvent.orderId, order.id));
    expect(events.map((e) => e.eventType)).toContain("expire_reconcile");
  });

  it("expires orders that never reached the provider", async () => {
    const order = await seedPendingOrder(null);

    const result = await service.expireOrder(order.id);

    expect(result.status).toBe(OrderStatus.EXPIRED);
  });

  it("batch job closes expired orders and reports counters", async () => {
    await seedPendingOrder("wechat_a");
    await seedPendingOrder("wechat_b");
    await db.update(orders).set({ createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) });

    const result = await service.expirePendingOrders(new Date(Date.now() - 60 * 60 * 1000));

    expect(result).toMatchObject({ scanned: 2, expired: 2, paid: 0, requiresReconciliation: 0 });
  });
});
