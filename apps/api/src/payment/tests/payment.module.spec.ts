import { Test, TestingModule } from "@nestjs/testing";

import { businessSettings } from "@earthworm/schema";
import { testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { PaymentChannelService } from "../payment-channel.service";
import { PAYMENT_PROVIDER, PAYMENT_PROVIDERS } from "../payment-provider.interface";
import { PaymentProviderRegistry } from "../payment-provider.registry";
import { PaymentModule } from "../payment.module";

/**
 * 依赖注入回归防线。
 *
 * 背景: 只有在真实启动 Nest 容器时才会暴露 DI 装配问题 (单元测试用 mock 注入绕过了容器)。
 * 本项目 e2e 需要 Redis/Logto, 因此这里用最小模块验证支付模块能被容器正确装配。
 */
describe("PaymentModule 依赖装配 (task 一 代码冻结检查)", () => {
  let module: TestingModule;
  let db: DbType;

  beforeAll(async () => {
    process.env.PAYMENT_PROVIDER = "mock";
    module = await Test.createTestingModule({
      imports: [...testImportModules, PaymentModule],
    }).compile();
    db = module.get<DbType>(DB);
    await db.delete(businessSettings);
  });

  afterAll(async () => {
    await db.delete(businessSettings);
    await module.close();
    await endDB();
  });

  it("constructs every provider and the registry (no undefined injections)", () => {
    const registry = module.get(PaymentProviderRegistry);

    expect(registry.get("mock").name).toBe("mock");
    expect(registry.get("wechat").name).toBe("wechat");
    expect(registry.get("alipay").name).toBe("alipay");
    expect(registry.list()).toHaveLength(3);
  });

  it("exposes the default provider and the registry under their tokens", () => {
    expect(module.get(PAYMENT_PROVIDER).name).toBe("mock");
    expect(module.get(PAYMENT_PROVIDERS)).toBeInstanceOf(PaymentProviderRegistry);
    expect(module.get(PaymentChannelService)).toBeInstanceOf(PaymentChannelService);
  });

  it("can run the payment channel startup hook without throwing in non-production", async () => {
    await expect(module.get(PaymentChannelService).onModuleInit()).resolves.toBeUndefined();
  });
});
