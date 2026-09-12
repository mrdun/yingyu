import { Module } from "@nestjs/common";

import { MockPaymentProvider } from "./mock-payment.provider";
import { PAYMENT_PROVIDER } from "./payment-provider.interface";
import { WechatPayProvider } from "./wechat-pay.provider";

function createPaymentProvider() {
  const name = process.env.PAYMENT_PROVIDER ?? "mock";
  if (name === "wechat") return new WechatPayProvider();
  if (name === "mock") return new MockPaymentProvider();
  throw new Error(`Unknown PAYMENT_PROVIDER: ${name}`);
}

@Module({
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      useFactory: createPaymentProvider,
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentModule {}
