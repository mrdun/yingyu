import { BadRequestException, Injectable } from "@nestjs/common";

import { AlipayProvider } from "./alipay.provider";
import { MockPaymentProvider } from "./mock-payment.provider";
import { PaymentMethod, providerOfMethod } from "./payment-method";
import { PaymentProvider } from "./payment-provider.interface";
import { WechatPayProvider } from "./wechat-pay.provider";

/**
 * Provider 注册表: 按订单 provider 路由回调/退款/关单。
 * 回调地址 /payment/callback/:provider 直接使用这里的 name 作为唯一键。
 */
@Injectable()
export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>();

  constructor(mock: MockPaymentProvider, wechat: WechatPayProvider, alipay: AlipayProvider) {
    for (const provider of [mock, wechat, alipay]) {
      this.providers.set(provider.name, provider);
    }
  }

  get(providerName: string): PaymentProvider {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new BadRequestException(`Unknown payment provider: ${providerName}`);
    }
    return provider;
  }

  /** 订单支付方式 → Provider (唯一映射, 防止渠道错配) */
  resolveMethod(method: PaymentMethod): PaymentProvider {
    return this.get(providerOfMethod(method));
  }

  list(): PaymentProvider[] {
    return Array.from(this.providers.values());
  }
}
