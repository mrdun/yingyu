import { createHmac, timingSafeEqual } from "node:crypto";

import { Injectable } from "@nestjs/common";

import {
  CreatePaymentResult,
  NormalizedPayment,
  PaymentOrder,
  PaymentProvider,
  RefundResult,
} from "./payment-provider.interface";

/**
 * 微信支付 Provider 适配器 (第一阶段)。
 * 仅建立协议/签名/回调边界; 未接入真实微信 SDK 与商户凭据。
 * - 验签使用 HMAC-SHA256 (可测试的模型, 真实接入需替换为微信 v2/v3 官方签名)
 * - createPayment/queryPayment/refundPayment 在缺少真实凭据时明确抛错, 不伪造成功。
 */
@Injectable()
export class WechatPayProvider implements PaymentProvider {
  readonly name = "wechat";

  private get appId() {
    return process.env.WECHAT_APP_ID ?? "";
  }
  private get mchId() {
    return process.env.WECHAT_MCH_ID ?? "";
  }
  private get apiKey() {
    return process.env.WECHAT_API_KEY ?? "";
  }

  private ensureConfigured() {
    if (!this.appId || !this.mchId || !this.apiKey) {
      throw new Error("WechatPay is not configured (missing WECHAT_APP_ID/MCH_ID/API_KEY)");
    }
  }

  async createPayment(order: PaymentOrder): Promise<CreatePaymentResult> {
    this.ensureConfigured();
    // 真实接入时调用微信统一下单; 当前仅返回客户端支付所需参数占位 (不伪造成功)
    return {
      providerOrderId: `wechat_${order.id}`,
      paymentPayload: {
        appId: this.appId,
        mchId: this.mchId,
        outTradeNo: order.id,
        totalFee: order.amountFen,
        codeUrl: null,
      },
    };
  }

  async queryPayment(order: PaymentOrder): Promise<NormalizedPayment> {
    this.ensureConfigured();
    // 真实接入时调用微信订单查询; 当前无真实凭据, 不伪造成功
    return {
      providerOrderId: order.providerOrderId ?? "",
      amountFen: order.amountFen,
      currency: order.currency,
      status: "pending",
    };
  }

  verifyCallback(raw: string, signature: string): boolean {
    const computed = createHmac("sha256", this.apiKey).update(raw).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(computed);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseCallback(payload: unknown): NormalizedPayment {
    const data = payload as Record<string, unknown>;
    return {
      providerOrderId: String(data["out_trade_no"] ?? ""),
      amountFen: Number(data["total_fee"] ?? 0),
      currency: String(data["currency"] ?? "CNY"),
      status: data["trade_state"] === "SUCCESS" ? "paid" : "failed",
      transactionId: data["transaction_id"] ? String(data["transaction_id"]) : undefined,
    };
  }

  async refundPayment(): Promise<RefundResult> {
    this.ensureConfigured();
    // 真实接入时调用微信退款 API; 当前无真实凭据, 明确失败而非伪造成功
    throw new Error("WechatPay refund is not connected");
  }
}
