import { HttpException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { businessSettings, plans, user } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { AdminController } from "../../admin/admin.controller";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { PartnerService } from "../../partner/partner.service";
import { AlipayProvider } from "../../payment/alipay.provider";
import { MockPaymentProvider } from "../../payment/mock-payment.provider";
import { PaymentChannelService } from "../../payment/payment-channel.service";
import { PaymentHttpClient } from "../../payment/payment-http.client";
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
import { PaymentProviderRegistry } from "../../payment/payment-provider.registry";
import { WechatPayProvider } from "../../payment/wechat-pay.provider";
import { PlansService } from "../../plans/plans.service";
import { MembershipController } from "../membership.controller";
import { MembershipService } from "../membership.service";

const fakeHttp: PaymentHttpClient = { send: jest.fn() };

/** 渠道桩: 记录 createPayment 的支付方式 */
class WechatStub implements PaymentProvider {
  readonly name = "wechat";
  readonly supportedMethods = ["wechat_native", "wechat_jsapi"] as const;
  readonly merchantId = "mch";
  readonly configured = true;
  lastMethod?: string;

  async createPayment(order: PaymentOrder, method?: string): Promise<CreatePaymentResult> {
    this.lastMethod = method;
    return {
      providerOrderId: order.id,
      paymentPayload: { provider: "wechat", method, codeUrl: "weixin://wxpay/bizpayurl?pr=x" },
    };
  }
  async queryPayment(order: PaymentOrder): Promise<NormalizedPayment> {
    return {
      providerOrderId: order.providerOrderId ?? order.id,
      amountFen: order.amountFen,
      currency: order.currency,
      status: "pending",
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
    return { refunded: true };
  }
  callbackAck(): CallbackAck {
    return { contentType: "application/xml", body: "<xml/>" };
  }
}

describe("购买流程: 选择 Plan → 选择支付方式 → 创建订单", () => {
  let controller: MembershipController;
  let service: MembershipService;
  let channelService: PaymentChannelService;
  let db: DbType;
  const wechat = new WechatStub();

  beforeAll(async () => {
    process.env.WECHAT_APP_ID = "wx_app";
    process.env.WECHAT_MCH_ID = "1900000000";
    process.env.WECHAT_API_KEY = "wechat-key";
    process.env.PUBLIC_API_BASE_URL = "https://api.example.com";

    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [
        MembershipService,
        PlansService,
        PartnerService,
        MockPaymentProvider,
        { provide: WechatPayProvider, useValue: wechat },
        { provide: AlipayProvider, useFactory: () => new AlipayProvider(fakeHttp) },
        PaymentProviderRegistry,
        PaymentChannelService,
        { provide: PAYMENT_PROVIDER, useValue: wechat },
        {
          provide: PAYMENT_PROVIDERS,
          inject: [PaymentProviderRegistry],
          useExisting: PaymentProviderRegistry,
        },
      ],
      controllers: [MembershipController],
    }).compile();

    db = module.get<DbType>(DB);
    controller = module.get<MembershipController>(MembershipController);
    service = module.get<MembershipService>(MembershipService);
    channelService = module.get<PaymentChannelService>(PaymentChannelService);
  });

  beforeEach(async () => {
    await cleanDB(db);
    await db.delete(businessSettings);
    await db.delete(plans);
    await db.insert(plans).values([
      { id: "monthly", name: "月度会员", priceFen: 1800, durationDays: 30, sortOrder: 1 },
      {
        id: "off",
        name: "已下架",
        priceFen: 1000,
        durationDays: 30,
        sortOrder: 2,
        isActive: false,
      },
    ]);
    await db.insert(user).values({ id: "u1" }).onConflictDoNothing();
    await channelService.setEnabled("wechat", true);
  });

  afterAll(async () => {
    await cleanDB(db);
    await db.delete(businessSettings);
    await db.delete(plans);
    await db.delete(user);
    delete process.env.PUBLIC_API_BASE_URL;
    await endDB();
  });

  it("exposes available payment methods to the client", async () => {
    const methods = await controller.paymentMethods();
    expect(methods.map((m) => m.method).sort()).toEqual(["mock", "wechat_jsapi", "wechat_native"]);
  });

  it("creates an order for the selected payment method and returns QR payload", async () => {
    const result = await controller.createOrder(
      { userId: "u1" },
      {
        planId: "monthly",
        paymentMethod: "wechat_native",
      },
    );

    expect(wechat.lastMethod).toBe("wechat_native");
    expect(result.paymentMethod).toBe("wechat_native");
    expect(result.amountFen).toBe(1800);
    expect(result.paymentPayload).toMatchObject({ codeUrl: "weixin://wxpay/bizpayurl?pr=x" });
    expect(result.expiresAt).toBeInstanceOf(Date);

    const order = await service.findOrder(result.orderId);
    expect(order.provider).toBe("wechat");
    expect(order.paymentMethod).toBe("wechat_native");
    expect(order.status).toBe("pending");
  });

  it("rejects an unsupported or disabled payment method", async () => {
    await expect(
      controller.createOrder({ userId: "u1" }, { planId: "monthly", paymentMethod: "paypal" }),
    ).rejects.toThrow(HttpException);

    await channelService.setEnabled("wechat", false);
    await expect(
      controller.createOrder(
        { userId: "u1" },
        { planId: "monthly", paymentMethod: "wechat_native" },
      ),
    ).rejects.toThrow(HttpException);
  });

  it("rejects purchasing an inactive plan", async () => {
    await expect(
      controller.createOrder({ userId: "u1" }, { planId: "off", paymentMethod: "wechat_native" }),
    ).rejects.toThrow("Plan is not available for purchase");
  });

  it("defaults to the first available method when none is chosen", async () => {
    const result = await controller.createOrder({ userId: "u1" }, { planId: "monthly" });
    // 测试/开发环境 mock 渠道可用, 因此默认取第一个可用方式; 生产环境 mock 不可用
    expect(result.paymentMethod).toBe("mock");
    expect((await service.findOrder(result.orderId)).provider).toBe("mock");
  });

  it("admin refund endpoint is admin-only", () => {
    const permissions = Reflect.getMetadata(
      "permissions",
      (AdminController.prototype as any).refundOrder,
    );
    expect(permissions).toEqual(["admin:access"]);
  });
});
