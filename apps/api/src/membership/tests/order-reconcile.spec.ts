import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";

import {
  commissionRecord,
  membership,
  membershipPeriod,
  orders,
  partner,
  partnerCommissionRule,
  plans,
  referral,
  user,
} from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { PartnerService } from "../../partner/partner.service";
import {
  CallbackAck,
  ClosePaymentResult,
  CreatePaymentResult,
  NormalizedPayment,
  PAYMENT_PROVIDER,
  PAYMENT_PROVIDERS,
  PaymentOrder,
  PaymentProvider,
  RefundResult,
} from "../../payment/payment-provider.interface";
import { MembershipService } from "../membership.service";
import { OrderStatus } from "../types/order-status";

/** 渠道桩: 可编程 查单/关单/退款 行为 */
class ReconcileStub implements PaymentProvider {
  readonly name = "wechat";
  readonly supportedMethods = ["wechat_native"] as const;
  readonly merchantId = "mch";
  readonly configured = true;

  queryStatus: NormalizedPayment["status"] = "pending";
  closeResult: ClosePaymentResult = { closed: true };
  refundError?: Error;
  refundCalls = 0;

  async createPayment(order: PaymentOrder): Promise<CreatePaymentResult> {
    return { providerOrderId: order.id };
  }
  async queryPayment(order: PaymentOrder): Promise<NormalizedPayment> {
    return {
      providerOrderId: order.providerOrderId ?? order.id,
      amountFen: order.amountFen,
      currency: order.currency,
      status: this.queryStatus,
      transactionId: this.queryStatus === "paid" ? "txn_recovered" : undefined,
    };
  }
  async closePayment(): Promise<ClosePaymentResult> {
    return this.closeResult;
  }
  verifyCallback(): boolean {
    return false;
  }
  parseCallback(): NormalizedPayment {
    throw new Error("not used");
  }
  async refundPayment(): Promise<RefundResult> {
    this.refundCalls++;
    if (this.refundError) throw this.refundError;
    return { refunded: true, refundId: "refund_1" };
  }
  callbackAck(): CallbackAck {
    return { contentType: "application/xml", body: "<xml/>" };
  }
}

describe("订单异常恢复 (task 六)", () => {
  let service: MembershipService;
  let partnerService: PartnerService;
  let db: DbType;
  const provider = new ReconcileStub();

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
    partnerService = module.get<PartnerService>(PartnerService);
  });

  beforeEach(async () => {
    provider.queryStatus = "pending";
    provider.closeResult = { closed: true };
    provider.refundError = undefined;
    provider.refundCalls = 0;

    await cleanDB(db);
    await db.delete(commissionRecord);
    await db.delete(referral);
    await db.delete(partner);
    await db.delete(partnerCommissionRule);
    await db.delete(plans);

    await db.insert(plans).values({
      id: "monthly",
      name: "月度会员",
      priceFen: 1800,
      durationDays: 30,
      sortOrder: 1,
    });
    await db.insert(partnerCommissionRule).values({
      id: "rule_40",
      partnerType: "lifetime",
      planId: null,
      rateBps: 4000,
      status: "active",
    });
    await db
      .insert(user)
      .values([{ id: "partner-user" }, { id: "buyer" }])
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await cleanDB(db);
    await db.delete(commissionRecord);
    await db.delete(referral);
    await db.delete(partner);
    await db.delete(partnerCommissionRule);
    await db.delete(plans);
    await db.delete(user);
    await endDB();
  });

  async function pendingOrder(providerOrderId = "wechat_o1") {
    return await service.createOrder({
      userId: "buyer",
      planId: "monthly",
      provider: "wechat",
      paymentMethod: "wechat_native",
      providerOrderId,
    });
  }

  /** 全链路已支付订单 (会员权益 + holding 佣金) */
  async function paidOrderWithCommission() {
    const p = await partnerService.becomePartner("partner-user");
    await partnerService.attributeReferral(p.referralCode, "buyer");
    const order = await pendingOrder("wechat_paid");
    await service.markOrderPaid(order.id, { transactionId: "txn_1" });
    return order;
  }

  it("recovers a paid-at-provider order whose callback was lost", async () => {
    const order = await pendingOrder();
    provider.queryStatus = "paid";

    const result = await service.reconcileOrder(order.id);

    expect(result).toMatchObject({ from: "pending", to: "paid", action: "provider_sync" });
    expect(await service.isMember("buyer")).toBe(true);
    const stored = await service.findOrder(order.id);
    expect(stored.providerTransactionId).toBe("txn_recovered");
  });

  it("closes then expires an overdue pending order", async () => {
    const order = await pendingOrder();
    await db
      .update(orders)
      .set({ createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) })
      .where(eq(orders.id, order.id));

    const result = await service.reconcileOrder(order.id);

    expect(result).toMatchObject({ to: OrderStatus.EXPIRED, action: "close_then_expire" });
  });

  it("leaves a still-pending order untouched", async () => {
    const order = await pendingOrder();

    const result = await service.reconcileOrder(order.id);

    expect(result).toMatchObject({ from: "pending", to: "pending", action: "provider_sync" });
  });

  it("does nothing for healthy orders", async () => {
    const order = await paidOrderWithCommission();
    const result = await service.reconcileOrder(order.id);
    expect(result).toMatchObject({ from: "paid", to: "paid", action: "noop" });
  });

  it("completes a refund interrupted after the claim (stuck refunding)", async () => {
    const order = await paidOrderWithCommission();
    // 模拟「置 refunding 后进程崩溃」: 本地停留在 refunding, 渠道退款未确认
    await db
      .update(orders)
      .set({ status: OrderStatus.REFUNDING, updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    const result = await service.reconcileOrder(order.id);

    expect(result).toMatchObject({ from: "refunding", to: OrderStatus.REFUNDED });
    expect(provider.refundCalls).toBe(1);
    expect((await service.findOrder(order.id)).status).toBe(OrderStatus.REFUNDED);
    expect(await service.isMember("buyer")).toBe(false);

    const [period] = await db
      .select()
      .from(membershipPeriod)
      .where(eq(membershipPeriod.orderId, order.id));
    expect(period.status).toBe("revoked");
    const [commission] = await db
      .select()
      .from(commissionRecord)
      .where(eq(commissionRecord.orderId, order.id));
    expect(commission.status).toBe("reversed");
  });

  it("reverts a stuck refunding order back to paid when the provider refund fails", async () => {
    const order = await paidOrderWithCommission();
    await db
      .update(orders)
      .set({ status: OrderStatus.REFUNDING, updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    provider.refundError = new Error("provider unavailable");

    const result = await service.reconcileOrder(order.id);

    expect(result).toMatchObject({ from: "refunding", to: OrderStatus.PAID });
    expect(await service.isMember("buyer")).toBe(true);
    const [m] = await db.select().from(membership).where(eq(membership.userId, "buyer"));
    expect(m.status).toBe("active");
  });

  it("stuck-refund job only picks up refunding orders older than 15 minutes", async () => {
    const fresh = await paidOrderWithCommission();
    await db
      .update(orders)
      .set({ status: OrderStatus.REFUNDING, updatedAt: new Date() })
      .where(eq(orders.id, fresh.id));

    await service.reconcileStuckRefundsJob();
    expect(provider.refundCalls).toBe(0); // 刚进入 refunding, 交给下一次任务

    await db
      .update(orders)
      .set({ updatedAt: new Date(Date.now() - 30 * 60 * 1000) })
      .where(eq(orders.id, fresh.id));

    await service.reconcileStuckRefundsJob();
    expect(provider.refundCalls).toBe(1);
    expect((await service.findOrder(fresh.id)).status).toBe(OrderStatus.REFUNDED);
  });
});
