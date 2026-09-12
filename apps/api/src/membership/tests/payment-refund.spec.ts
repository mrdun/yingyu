import { BadRequestException } from "@nestjs/common";
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

/** 渠道桩: 控制退款成功/失败 */
class RefundStubProvider implements PaymentProvider {
  readonly name = "wechat";
  readonly supportedMethods = ["wechat_native"] as const;
  readonly merchantId = "mch";
  readonly configured = true;

  refundCalls = 0;
  refundError?: Error;
  refundAccepted = true;

  async createPayment(order: PaymentOrder): Promise<CreatePaymentResult> {
    return { providerOrderId: order.id };
  }
  async queryPayment(order: PaymentOrder): Promise<NormalizedPayment> {
    return {
      providerOrderId: order.providerOrderId ?? order.id,
      amountFen: order.amountFen,
      currency: order.currency,
      status: "paid",
    };
  }
  async closePayment(): Promise<ClosePaymentResult> {
    return { closed: true };
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
    return { refunded: this.refundAccepted, refundId: "refund_1" };
  }
  callbackAck(): CallbackAck {
    return { contentType: "application/xml", body: "<xml/>" };
  }
}

describe("管理员退款 (订单 → 会员权益 → 佣金 一致性)", () => {
  let service: MembershipService;
  let partnerService: PartnerService;
  let db: DbType;
  const provider = new RefundStubProvider();

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
    provider.refundCalls = 0;
    provider.refundError = undefined;
    provider.refundAccepted = true;

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

  /** 全链路: 归因 → 下单 → 支付成功 (产生会员权益 + holding 佣金) */
  async function paidOrderWithCommission() {
    const p = await partnerService.becomePartner("partner-user");
    await partnerService.attributeReferral(p.referralCode, "buyer");

    const order = await service.createOrder({
      userId: "buyer",
      planId: "monthly",
      provider: "wechat",
      paymentMethod: "wechat_native",
      providerOrderId: "wechat_order_1",
    });
    await service.markOrderPaid(order.id, { transactionId: "txn_1" });
    return order;
  }

  it("refunds through the provider and rolls back membership + commission", async () => {
    const order = await paidOrderWithCommission();
    expect(await service.isMember("buyer")).toBe(true);

    const [before] = await db
      .select()
      .from(commissionRecord)
      .where(eq(commissionRecord.orderId, order.id));
    expect(before.status).toBe("holding");
    expect(before.commissionFen).toBe(720); // 1800 * 40%

    const refunded = await service.refundOrder(order.id);

    expect(refunded.status).toBe(OrderStatus.REFUNDED);
    expect(provider.refundCalls).toBe(1);

    // 会员权益撤销
    expect(await service.isMember("buyer")).toBe(false);
    const [period] = await db
      .select()
      .from(membershipPeriod)
      .where(eq(membershipPeriod.orderId, order.id));
    expect(period.status).toBe("revoked");
    const [m] = await db.select().from(membership).where(eq(membership.userId, "buyer"));
    expect(m.status).toBe("cancelled");

    // 佣金回滚
    const [after] = await db
      .select()
      .from(commissionRecord)
      .where(eq(commissionRecord.orderId, order.id));
    expect(after.status).toBe("reversed");
  });

  it("rejects a second refund and never calls the provider twice", async () => {
    const order = await paidOrderWithCommission();

    await service.refundOrder(order.id);
    await expect(service.refundOrder(order.id)).rejects.toThrow(BadRequestException);

    expect(provider.refundCalls).toBe(1);
  });

  it("keeps order paid + membership active + commission holding when provider refund fails", async () => {
    const order = await paidOrderWithCommission();
    provider.refundError = new Error("provider timeout");

    await expect(service.refundOrder(order.id)).rejects.toThrow(/provider timeout/);

    const stored = await service.findOrder(order.id);
    expect(stored.status).toBe(OrderStatus.PAID);
    expect(await service.isMember("buyer")).toBe(true);
    const [commission] = await db
      .select()
      .from(commissionRecord)
      .where(eq(commissionRecord.orderId, order.id));
    expect(commission.status).toBe("holding");

    // 允许修正后重试 (状态已回滚为 paid)
    provider.refundError = undefined;
    await expect(service.refundOrder(order.id)).resolves.toMatchObject({
      status: OrderStatus.REFUNDED,
    });
  });

  it("treats a provider-rejected refund as failure (no local refund)", async () => {
    const order = await paidOrderWithCommission();
    provider.refundAccepted = false;

    await expect(service.refundOrder(order.id)).rejects.toThrow(/rejected/);
    expect((await service.findOrder(order.id)).status).toBe(OrderStatus.PAID);
  });

  it("only paid orders can be refunded (pending is rejected)", async () => {
    const order = await service.createOrder({
      userId: "buyer",
      planId: "monthly",
      provider: "wechat",
      paymentMethod: "wechat_native",
      providerOrderId: "wechat_pending",
    });

    await expect(service.refundOrder(order.id)).rejects.toThrow(BadRequestException);
    expect(provider.refundCalls).toBe(0);
  });

  it("records the refund request event for audit", async () => {
    const order = await paidOrderWithCommission();
    await service.refundOrder(order.id);

    const [refunded] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(refunded.refundedAt).not.toBeNull();
  });
});
