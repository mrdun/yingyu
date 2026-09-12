import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";

import { membership, membershipPeriod, orders, paymentEvent, plans, user } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { PartnerService } from "../../partner/partner.service";
import { PaymentHttpClient } from "../../payment/payment-http.client";
import { PAYMENT_PROVIDER, PAYMENT_PROVIDERS } from "../../payment/payment-provider.interface";
import { WechatPayProvider } from "../../payment/wechat-pay.provider";
import { buildWechatXml, wechatSign } from "../../payment/wechat-signature";
import { MembershipService } from "../membership.service";
import { PaymentCallbackController } from "../payment-callback.controller";

const APP_ID = "wx_test_app";
const MCH_ID = "1900000000";
const API_KEY = "test-api-key-32-characters-long";
const NOTIFY_BASE = "https://api.example.com";

/** 假 HTTP 传输: 真实 Provider 的网络边界被替换, 协议/签名逻辑保持真实 */
const fakeHttp: PaymentHttpClient = { send: jest.fn() };

function wechatCallbackXml(overrides: Record<string, string> = {}): string {
  const params: Record<string, string> = {
    appid: APP_ID,
    mch_id: MCH_ID,
    out_trade_no: "wechat_order_1",
    total_fee: "1800",
    currency: "CNY",
    return_code: "SUCCESS",
    result_code: "SUCCESS",
    trade_state: "SUCCESS",
    transaction_id: "txn_1",
    ...overrides,
  };
  const sign = wechatSign(params, API_KEY, "MD5");
  return buildWechatXml({ ...params, sign });
}

function signedXmlWith(overrides: Record<string, string>, tamper: Record<string, string>) {
  // 用原参数签名后篡改字段: 模拟攻击者改金额/商户号
  const params: Record<string, string> = {
    appid: APP_ID,
    mch_id: MCH_ID,
    out_trade_no: "wechat_order_1",
    total_fee: "1800",
    currency: "CNY",
    return_code: "SUCCESS",
    result_code: "SUCCESS",
    trade_state: "SUCCESS",
    transaction_id: "txn_1",
    ...overrides,
  };
  const sign = wechatSign(params, API_KEY, "MD5");
  return buildWechatXml({ ...params, ...tamper, sign });
}

function mockResponse() {
  const res: any = {
    status: jest.fn(() => res),
    type: jest.fn(() => res),
    send: jest.fn(() => res),
  };
  return res;
}

describe("PaymentCallbackController (raw body + 微信 v2 真实验签)", () => {
  let provider: WechatPayProvider;
  let controller: PaymentCallbackController;
  let service: MembershipService;
  let db: DbType;

  beforeAll(async () => {
    process.env.WECHAT_APP_ID = APP_ID;
    process.env.WECHAT_MCH_ID = MCH_ID;
    process.env.WECHAT_API_KEY = API_KEY;
    process.env.PUBLIC_API_BASE_URL = NOTIFY_BASE;
    provider = new WechatPayProvider(fakeHttp);

    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [
        MembershipService,
        PartnerService,
        { provide: PAYMENT_PROVIDER, useValue: provider },
        { provide: PAYMENT_PROVIDERS, useValue: { get: () => provider } },
        PaymentCallbackController,
      ],
    }).compile();

    db = module.get<DbType>(DB);
    service = module.get<MembershipService>(MembershipService);
    controller = module.get<PaymentCallbackController>(PaymentCallbackController);
  });

  beforeEach(async () => {
    await cleanDB(db);
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
    await db.delete(plans);
    await db.delete(user);
    delete process.env.PUBLIC_API_BASE_URL;
    await endDB();
  });

  async function seedOrder(providerOrderId = "wechat_order_1") {
    return await service.createOrder({
      userId: "u1",
      planId: "monthly",
      provider: "wechat",
      paymentMethod: "wechat_native",
      providerOrderId,
    });
  }

  it("verifies a real v2 signature and rejects tampered/unmatched keys", () => {
    const raw = wechatCallbackXml();
    expect(provider.verifyCallback(raw)).toBe(true);

    // 篡改金额后签名失效
    expect(provider.verifyCallback(signedXmlWith({}, { total_fee: "1" }))).toBe(false);
    // 错误密钥签名
    const wrongKeyXml = buildWechatXml({
      appid: APP_ID,
      mch_id: MCH_ID,
      out_trade_no: "wechat_order_1",
      total_fee: "1800",
      return_code: "SUCCESS",
      result_code: "SUCCESS",
      trade_state: "SUCCESS",
      sign: wechatSign({ out_trade_no: "wechat_order_1" }, "another-key", "MD5"),
    });
    expect(provider.verifyCallback(wrongKeyXml)).toBe(false);
  });

  it("parses the raw XML callback into a normalized payment", () => {
    const parsed = provider.parseCallback(wechatCallbackXml());
    expect(parsed).toMatchObject({
      providerOrderId: "wechat_order_1",
      amountFen: 1800,
      currency: "CNY",
      status: "paid",
      transactionId: "txn_1",
      merchantId: MCH_ID,
    });
  });

  it("rejects a callback with an invalid signature", async () => {
    await seedOrder();
    const res = mockResponse();

    await expect(
      controller.handle(
        "wechat",
        { rawBody: Buffer.from(signedXmlWith({}, { total_fee: "1" })) } as any,
        res,
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a callback whose body was pre-parsed (raw body required)", async () => {
    await seedOrder();
    const res = mockResponse();

    await expect(
      controller.handle("wechat", { body: { out_trade_no: "wechat_order_1" } } as any, res),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects a callback with a modified amount (signature valid, amount tampered by re-signing)", async () => {
    await seedOrder();
    const res = mockResponse();
    // 攻击者用真实密钥签了 1 分钱的通知, 企图低价开通会员
    const raw = wechatCallbackXml({ total_fee: "1" });

    await expect(
      controller.handle("wechat", { rawBody: Buffer.from(raw) } as any, res),
    ).rejects.toThrow(BadRequestException);
    const order = await service.findOrderByProviderOrderId("wechat_order_1");
    expect(order?.status).toBe("pending");
  });

  it("rejects a callback from another merchant", async () => {
    await seedOrder();
    const res = mockResponse();
    const raw = wechatCallbackXml({ mch_id: "1900009999" });

    await expect(
      controller.handle("wechat", { rawBody: Buffer.from(raw) } as any, res),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects a callback for an unknown order", async () => {
    const res = mockResponse();
    const raw = wechatCallbackXml({ out_trade_no: "not_exists" });

    await expect(
      controller.handle("wechat", { rawBody: Buffer.from(raw) } as any, res),
    ).rejects.toThrow(NotFoundException);
  });

  it("activates membership on a valid paid callback and stores audit fields", async () => {
    const order = await seedOrder();
    const res = mockResponse();

    await controller.handle("wechat", { rawBody: Buffer.from(wechatCallbackXml()) } as any, res);

    const stored = await service.findOrder(order.id);
    expect(stored.status).toBe("paid");
    expect(stored.providerTransactionId).toBe("txn_1");
    expect(await service.isMember("u1")).toBe(true);

    const [m] = await db.select().from(membership).where(eq(membership.userId, "u1"));
    expect(m.status).toBe("active");

    // 回调应答为微信要求的 XML
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining("<return_code>SUCCESS</return_code>"),
    );

    // 原始报文留痕 (审计/对账)
    const [event] = await db.select().from(paymentEvent).where(eq(paymentEvent.orderId, order.id));
    expect(event.payload).toContain("<out_trade_no>wechat_order_1</out_trade_no>");
    expect(event.eventType).toBe("callback");
    expect(event.processedAt).not.toBeNull();
  });

  it("is idempotent for duplicated callbacks (no double activation)", async () => {
    const order = await seedOrder();
    const raw = wechatCallbackXml();

    await controller.handle("wechat", { rawBody: Buffer.from(raw) } as any, mockResponse());
    await controller.handle("wechat", { rawBody: Buffer.from(raw) } as any, mockResponse());

    const periods = await db
      .select()
      .from(membershipPeriod)
      .where(eq(membershipPeriod.orderId, order.id));
    expect(periods).toHaveLength(1);
  });
});
