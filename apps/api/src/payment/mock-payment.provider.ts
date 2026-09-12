import { Injectable } from "@nestjs/common";
import { createId } from "@paralleldrive/cuid2";

import { isProduction } from "../common/env";
import {
  CreateOrderResult,
  PaymentOrderStatus,
  PaymentProvider,
  QueryOrderResult,
} from "./payment-provider.interface";

/**
 * 模拟支付 Provider (仅开发环境使用, 生产接入微信支付时删除本文件)。
 * - createOrder: 生成模拟订单号 + payUrl 指向 mock-pay 页面
 * - queryOrder: 订单创建超过 10 秒自动视为支付成功 (模拟异步回调)
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  /** providerOrderId -> 创建时间 */
  private readonly orders = new Map<string, number>();
  /** 模拟支付成功等待时长 (ms) */
  static readonly AUTO_PAID_DELAY_MS = 10_000;

  async createOrder(userId: string, planId: string): Promise<CreateOrderResult> {
    if (isProduction()) {
      throw new Error("Mock payment is not available in production");
    }
    const orderId = `mock_${createId()}`;
    this.orders.set(orderId, Date.now());
    return {
      orderId,
      payUrl: `/membership/mock-pay/${orderId}?confirm=1`,
    };
  }

  async queryOrder(orderId: string): Promise<QueryOrderResult> {
    if (isProduction()) {
      return { status: "failed" as PaymentOrderStatus };
    }
    const createdAt = this.orders.get(orderId);
    if (!createdAt) {
      return { status: "failed" as PaymentOrderStatus };
    }
    const elapsed = Date.now() - createdAt;
    const status: PaymentOrderStatus =
      elapsed >= MockPaymentProvider.AUTO_PAID_DELAY_MS ? "paid" : "pending";
    return { status };
  }
}
