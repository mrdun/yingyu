import { getHttp } from "./http";

export type MembershipPlanId = "monthly" | "quarterly" | "yearly";

export interface MembershipPlanInfo {
  id: MembershipPlanId;
  name: string;
  priceFen: number;
  priceYuan: string;
  durationDays: number;
  description: string;
}

export interface MembershipStatus {
  isMember: boolean;
  type: string | null;
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

/** 会员计划常量 (与 apps/api/src/membership/plans.ts 保持一致) */
export const MEMBERSHIP_PLANS: MembershipPlanInfo[] = [
  {
    id: "monthly",
    name: "月度会员",
    priceFen: 1800,
    priceYuan: "¥18",
    durationDays: 30,
    description: "适合先体验一下",
  },
  {
    id: "quarterly",
    name: "季度会员",
    priceFen: 4800,
    priceYuan: "¥48",
    durationDays: 90,
    description: "性价比之选",
  },
  {
    id: "yearly",
    name: "年度会员",
    priceFen: 16800,
    priceYuan: "¥168",
    durationDays: 365,
    description: "最划算, 立省 4 个月",
  },
];

export async function fetchMembershipStatus() {
  const http = getHttp();
  return await http<{
    isMember: boolean;
    type: string | null;
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
