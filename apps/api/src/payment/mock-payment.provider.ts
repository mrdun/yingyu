import { Injectable } from "@nestjs/common";
import { createId } from "@paralleldrive/cuid2";

import { isProduction } from "../common/env";
import {
  CallbackAck,
  ClosePaymentResult,
  CreatePaymentResult,
  NormalizedPayment,
  PaymentOrder,
  PaymentOrderStatus,
  PaymentProvider,
  RefundResult,
} from "./payment-provider.interface";

/**
 * 模拟支付 Provider (仅开发环境使用, 生产禁止)。
 * - createPayment: 生成模拟订单号 + payUrl 指向 mock-pay 页面
 * - queryPayment: 订单创建超过 10 秒自动视为支付成功 (模拟异步回调)
 * - verifyCallback/parseCallback: Mock 不走真实 callback, 不支持
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  readonly supportedMethods = ["mock"] as const;

  private readonly orders = new Map<string, number>();
  static readonly AUTO_PAID_DELAY_MS = 10_000;

  get merchantId(): undefined {
    return undefined;
  }

  get configured(): boolean {
    return !isProduction();
  }

  async createPayment(order: PaymentOrder, method?: string): Promise<CreatePaymentResult> {
    if (isProduction()) {
      throw new Error("Mock payment is not available in production");
    }
    if (method && !(this.supportedMethods as readonly string[]).includes(method)) {
      throw new Error(`Mock payment does not support method: ${method}`);
    }
    const providerOrderId = `mock_${createId()}`;
    this.orders.set(providerOrderId, Date.now());
    return {
      providerOrderId,
      paymentPayload: { payUrl: `/membership/mock-pay/${providerOrderId}?confirm=1` },
    };
  }

  async queryPayment(order: PaymentOrder): Promise<NormalizedPayment> {
    if (isProduction()) {
      return {
        providerOrderId: order.providerOrderId ?? "",
        amountFen: order.amountFen,
        currency: order.currency,
        status: "failed",
      };
    }
    const createdAt = this.orders.get(order.providerOrderId ?? "");
    if (!createdAt) {
      return {
        providerOrderId: order.providerOrderId ?? "",
        amountFen: order.amountFen,
        currency: order.currency,
        status: "failed",
      };
    }
    const status: PaymentOrderStatus =
      Date.now() - createdAt >= MockPaymentProvider.AUTO_PAID_DELAY_MS ? "paid" : "pending";
    return {
      providerOrderId: order.providerOrderId ?? "",
      amountFen: order.amountFen,
      currency: order.currency,
      status,
    };
  }

  verifyCallback(): boolean {
    // Mock 无真实 callback, 不支持验签
    return false;
  }

  parseCallback(): NormalizedPayment {
    throw new Error("Mock payment does not support callback");
  }

  /** Mock 无第三方面单, 直接视为已关闭 */
  async closePayment(): Promise<ClosePaymentResult> {
    return { closed: true };
  }

  async refundPayment(order: PaymentOrder): Promise<RefundResult> {
    if (isProduction()) {
      throw new Error("Mock payment is not available in production");
    }
    return { refunded: true };
  }

  callbackAck(): CallbackAck {
    return { contentType: "application/json; charset=utf-8", body: JSON.stringify({ ok: true }) };
  }
}
