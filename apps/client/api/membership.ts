import { getHttp } from "./http";

export type MembershipPlanId = "monthly" | "quarterly" | "yearly" | "lifetime";

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
  payUrl: string;
  amountFen: number;
}

export interface OrderStatusResponse {
  orderId: string;
  planId: string;
  amountFen: number;
  status: "pending" | "paid" | "failed";
  paidAt: string | null;
  createdAt: string;
}

/** 会员方案 (价格以服务端 DB plans 为唯一权威) */
export async function fetchPlans(): Promise<MembershipPlanInfo[]> {
  const http = getHttp();
  return await http<MembershipPlanInfo[]>("/plans", { method: "get" });
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

export async function createMembershipOrder(planId: MembershipPlanId) {
  const http = getHttp();
  return await http<CreateOrderResponse>("/membership/orders", {
    method: "post",
    body: { planId },
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
