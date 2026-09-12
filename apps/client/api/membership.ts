import { getHttp } from "./http";

export type MembershipPlanId = "monthly" | "quarterly" | "yearly" | "lifetime";

/** 支付方式 (与后端 payment-method.ts 一一对应) */
export type PaymentMethod = "mock" | "wechat_native" | "wechat_jsapi" | "alipay_qr";

export interface PaymentMethodInfo {
  method: PaymentMethod;
  provider: string;
  label: string;
  qr: boolean;
}

/** 支付参数: codeUrl(微信扫码) / qrCode(支付宝扫码) / payUrl(模拟支付) / jsapiParams */
export interface PaymentPayload {
  provider?: string;
  method?: PaymentMethod;
  codeUrl?: string | null;
  qrCode?: string | null;
  prepayId?: string | null;
  payUrl?: string;
  jsapiParams?: Record<string, string>;
}

export interface MembershipPlanInfo {
  id: MembershipPlanId;
  name: string;
  priceFen: number;
  durationDays: number | null;
}

export interface MembershipStatus {
  isMember: boolean;
  type: string | null;
  planId: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface CreateOrderResponse {
  orderId: string;
  providerOrderId?: string;
  paymentMethod: PaymentMethod;
  paymentPayload?: PaymentPayload;
  amountFen: number;
  expiresAt?: string;
}

export interface OrderStatusResponse {
  orderId: string;
  planId: string;
  amountFen: number;
  status: "pending" | "processing" | "paid" | "failed" | "cancelled" | "expired" | "refunded";
  paymentMethod?: PaymentMethod | null;
  providerOrderId?: string | null;
  expiresAt?: string | null;
  paidAt: string | null;
  createdAt: string;
}

/** 会员方案 (价格以服务端 DB plans 为唯一权威) */
export async function fetchPlans(): Promise<MembershipPlanInfo[]> {
  const http = getHttp();
  return await http<MembershipPlanInfo[]>("/plans", { method: "get" });
}

/** 可用支付方式 (渠道开关 + 环境变量凭据由后端判定) */
export async function fetchPaymentMethods(): Promise<PaymentMethodInfo[]> {
  const http = getHttp();
  return await http<PaymentMethodInfo[]>("/membership/payment-methods", { method: "get" });
}

export async function fetchMembershipStatus() {
  const http = getHttp();
  return await http<{
    isMember: boolean;
    type: string | null;
    planId: string | null;
    startDate: string | null;
    endDate: string | null;
  }>("/membership/status", { method: "get" });
}

export async function createMembershipOrder(
  planId: MembershipPlanId,
  paymentMethod?: PaymentMethod,
  idempotencyKey?: string,
) {
  const http = getHttp();
  return await http<CreateOrderResponse>("/membership/orders", {
    method: "post",
    body: { planId, paymentMethod, idempotencyKey },
  });
}

export async function fetchOrderStatus(orderId: string) {
  const http = getHttp();
  return await http<OrderStatusResponse>(`/membership/orders/${orderId}`, {
    method: "get",
  });
}

/**
 * 模拟支付确认 (仅 dev): 直接请求 mock-pay 页面, 触发订单置为 paid
 */
export async function confirmMockPay(orderId: string) {
  const http = getHttp();
  return await http<string>(`/membership/mock-pay/${orderId}?confirm=1`, {
    method: "get",
  });
}
