/**
 * 支付抽象层: 为接入真实微信支付预留, 当前仅有 Mock 实现。
 * 生产接入时: 新建 WechatPaymentProvider implements PaymentProvider,
 * 在 payment.module.ts 中替换 useClass 即可。
 */
export type PaymentOrderStatus = "pending" | "paid" | "failed";

export interface CreateOrderResult {
  orderId: string;
  payUrl?: string;
  qrCode?: string;
}

export interface QueryOrderResult {
  status: PaymentOrderStatus;
}

export interface PaymentProvider {
  createOrder(userId: string, planId: string): Promise<CreateOrderResult>;
  queryOrder(orderId: string): Promise<QueryOrderResult>;
}

export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");
