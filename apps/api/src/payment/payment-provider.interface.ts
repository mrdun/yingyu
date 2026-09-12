/**
 * 支付抽象层: 业务层只依赖统一 PaymentProvider, 不直接依赖微信/支付宝 SDK。
 * Provider 负责第三方协议、签名、请求/响应解析; markOrderPaid/refundOrder 仍是
 * 唯一业务激活/退款入口。
 */

export type PaymentOrderStatus = "pending" | "paid" | "failed";

/** 传给 Provider 的完整订单上下文 (金额/币种由服务端 DB 派生) */
export interface PaymentOrder {
  id: string;
  userId: string;
  planId: string;
  amountFen: number;
  currency: string;
  providerOrderId: string | null;
}

export interface CreatePaymentResult {
  providerOrderId: string;
  /** QR code / redirect URL / client payment params */
  paymentPayload?: unknown;
}

/** 归一化的第三方支付结果 (callback/query 统一) */
export interface NormalizedPayment {
  providerOrderId: string;
  amountFen: number;
  currency: string;
  status: PaymentOrderStatus;
  transactionId?: string;
}

export interface RefundResult {
  refunded: boolean;
}

export interface PaymentProvider {
  readonly name: string;
  createPayment(order: PaymentOrder): Promise<CreatePaymentResult>;
  queryPayment(order: PaymentOrder): Promise<NormalizedPayment>;
  /** 验签 (Provider 协议层) */
  verifyCallback(raw: string, signature: string): boolean;
  /** 解析并归一化 callback */
  parseCallback(payload: unknown): NormalizedPayment;
  refundPayment(order: PaymentOrder, amountFen?: number): Promise<RefundResult>;
}

export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");
