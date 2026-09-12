import { Module } from "@nestjs/common";

import { AlipayProvider } from "./alipay.provider";
import { MockPaymentProvider } from "./mock-payment.provider";
import { PaymentChannelAdminController } from "./payment-channel-admin.controller";
import { PaymentChannelService } from "./payment-channel.service";
import { AxiosPaymentHttpClient, PAYMENT_HTTP } from "./payment-http.client";
import { PAYMENT_PROVIDER, PAYMENT_PROVIDERS } from "./payment-provider.interface";
import { PaymentProviderRegistry } from "./payment-provider.registry";
import { WechatPayProvider } from "./wechat-pay.provider";

/**
 * 支付模块: HTTP 传输层 + 各渠道 Provider + 注册表 + 渠道开关配置。
 *
 * - 订单创建按支付方式路由到 Provider (registry.resolveMethod)
 * - 回调/退款/关单按订单 provider 路由 (registry.get)
 * - PAYMENT_PROVIDER 保留为「默认渠道」(环境变量 PAYMENT_PROVIDER, 缺省 mock),
 *   兼容既有调用方与测试
 */
@Module({
  providers: [
    { provide: PAYMENT_HTTP, useClass: AxiosPaymentHttpClient },
    MockPaymentProvider,
    WechatPayProvider,
    AlipayProvider,
    PaymentProviderRegistry,
    PaymentChannelService,
    {
      provide: PAYMENT_PROVIDERS,
      useExisting: PaymentProviderRegistry,
    },
    {
      provide: PAYMENT_PROVIDER,
      inject: [PaymentProviderRegistry],
      useFactory: (registry: PaymentProviderRegistry) => {
        const name = process.env.PAYMENT_PROVIDER ?? "mock";
        return registry.get(name);
      },
    },
  ],
  controllers: [PaymentChannelAdminController],
  exports: [PAYMENT_PROVIDER, PAYMENT_PROVIDERS, PaymentChannelService],
})
export class PaymentModule {}
