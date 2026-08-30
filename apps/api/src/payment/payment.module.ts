import { Module } from "@nestjs/common";

import { MockPaymentProvider } from "./mock-payment.provider";
import { PAYMENT_PROVIDER } from "./payment-provider.interface";

@Module({
  providers: [
    // 生产接入微信支付时, 将 MockPaymentProvider 替换为 WechatPaymentProvider
    {
      provide: PAYMENT_PROVIDER,
      useClass: MockPaymentProvider,
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentModule {}
