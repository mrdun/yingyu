import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";

import { businessSettings } from "@earthworm/schema";
import { testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { AlipayProvider } from "../alipay.provider";
import { MockPaymentProvider } from "../mock-payment.provider";
import { PaymentChannelAdminController } from "../payment-channel-admin.controller";
import { PaymentChannelService } from "../payment-channel.service";
import { PaymentHttpClient } from "../payment-http.client";
import { PaymentProviderRegistry } from "../payment-provider.registry";
import { WechatPayProvider } from "../wechat-pay.provider";

const fakeHttp: PaymentHttpClient = { send: jest.fn() };
const WECHAT_KEY = "wechat-secret-key-should-never-be-returned";
const ALIPAY_KEY =
  "-----BEGIN RSA PRIVATE KEY-----\nnot-a-real-key\n-----END RSA PRIVATE KEY-----\n";

describe("PaymentChannelService (渠道开关, 不暴露密钥)", () => {
  let service: PaymentChannelService;
  let db: DbType;

  beforeAll(async () => {
    process.env.WECHAT_APP_ID = "wx_app";
    process.env.WECHAT_MCH_ID = "1900000000";
    process.env.WECHAT_API_KEY = WECHAT_KEY;
    process.env.PUBLIC_API_BASE_URL = "https://api.example.com";
    process.env.ALIPAY_APP_ID = "2021000000000000";
    process.env.ALIPAY_PRIVATE_KEY = ALIPAY_KEY;
    process.env.ALIPAY_PUBLIC_KEY = ALIPAY_KEY;

    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [
        MockPaymentProvider,
        {
          provide: WechatPayProvider,
          useFactory: () => new WechatPayProvider(fakeHttp),
        },
        {
          provide: AlipayProvider,
          useFactory: () => new AlipayProvider(fakeHttp),
        },
        PaymentProviderRegistry,
        PaymentChannelService,
      ],
    }).compile();

    db = module.get<DbType>(DB);
    service = module.get<PaymentChannelService>(PaymentChannelService);
  });

  beforeEach(async () => {
    await db.delete(businessSettings);
  });

  afterAll(async () => {
    await db.delete(businessSettings);
    delete process.env.WECHAT_API_KEY;
    delete process.env.WECHAT_CERT_PATH;
    await endDB();
  });

  it("defaults to disabled channels and exposes no secrets", async () => {
    const channels = await service.listChannels();
    const serialized = JSON.stringify(channels);

    expect(channels.find((c) => c.provider === "wechat")).toMatchObject({
      enabled: false,
      configured: true,
    });
    expect(channels.find((c) => c.provider === "alipay")).toMatchObject({ enabled: false });
    expect(serialized).not.toContain(WECHAT_KEY);
    expect(serialized).not.toContain("BEGIN RSA PRIVATE KEY");
    // 非生产环境 mock 可用, 但微信/支付宝渠道未开启
    expect((await service.availableMethods()).map((m) => m.method)).toEqual(["mock"]);
    expect(await service.isMethodAvailable("wechat_native")).toBe(false);
  });

  it("enables a channel and exposes only its methods", async () => {
    await service.setEnabled("wechat", true);

    const channels = await service.listChannels();
    expect(channels.find((c) => c.provider === "wechat")?.enabled).toBe(true);

    const methods = await service.availableMethods();
    expect(methods.map((m) => m.method).sort()).toEqual(["mock", "wechat_jsapi", "wechat_native"]);
    expect(await service.isMethodAvailable("alipay_qr")).toBe(false);
    expect(await service.isMethodAvailable("wechat_native")).toBe(true);
  });

  it("rejects unknown providers", async () => {
    await expect(service.setEnabled("paypal", true)).rejects.toThrow(BadRequestException);
  });

  it('admin toggle rejects non-boolean enabled values (防止 "false" 被当成 true)', async () => {
    const controller = new PaymentChannelAdminController(service);

    await expect(
      controller.update("wechat", { enabled: "false" as unknown as boolean }),
    ).rejects.toThrow(BadRequestException);
    await expect(controller.update("wechat", {} as { enabled: boolean })).rejects.toThrow(
      BadRequestException,
    );

    await expect(controller.update("wechat", { enabled: true })).resolves.toMatchObject({
      provider: "wechat",
      enabled: true,
    });
    await expect(controller.update("wechat", { enabled: false })).resolves.toMatchObject({
      enabled: false,
    });
  });

  it("reports a configured channel as unavailable when credentials are missing", async () => {
    await service.setEnabled("wechat", true);
    delete process.env.WECHAT_API_KEY;

    const channels = await service.listChannels();
    expect(channels.find((c) => c.provider === "wechat")).toMatchObject({
      enabled: true,
      configured: false,
    });
    expect(await service.isMethodAvailable("wechat_native")).toBe(false);

    process.env.WECHAT_API_KEY = WECHAT_KEY;
  });

  it("keeps mock payment unavailable in production", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(await service.isMethodAvailable("mock")).toBe(false);
      const channels = await service.listChannels();
      expect(channels.find((c) => c.provider === "mock")?.configured).toBe(false);
    } finally {
      process.env.NODE_ENV = original;
    }

    expect(await service.isMethodAvailable("mock")).toBe(true);
  });

  it("reads order expiry minutes from business settings with a safe default", async () => {
    expect(await service.orderExpireMinutes()).toBe(120);

    await db.insert(businessSettings).values({ key: "order_expire_minutes", value: "30" });
    expect(await service.orderExpireMinutes()).toBe(30);

    await db
      .update(businessSettings)
      .set({ value: "abc" })
      .where(eq(businessSettings.key, "order_expire_minutes"));
    expect(await service.orderExpireMinutes()).toBe(120);
  });

  it("fails startup in production when an enabled channel lacks credentials (task 五)", async () => {
    const original = process.env.NODE_ENV;
    const originalKey = process.env.WECHAT_API_KEY;
    process.env.NODE_ENV = "production";
    delete process.env.WECHAT_API_KEY;
    await service.setEnabled("wechat", true);

    try {
      await expect(service.onModuleInit()).rejects.toThrow(/缺少凭据|支付配置不完整/);
    } finally {
      process.env.NODE_ENV = original;
      if (originalKey !== undefined) process.env.WECHAT_API_KEY = originalKey;
      await service.setEnabled("wechat", false);
    }
  });

  it("does not fail startup in production when no channel is enabled", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    await service.setEnabled("wechat", false);
    await service.setEnabled("alipay", false);

    try {
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});
