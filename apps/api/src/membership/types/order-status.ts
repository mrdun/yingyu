/**
 * 订单状态统一入口 (避免散落字符串)。
 * 状态机:
 *   pending -> processing | failed | cancelled | expired
 *   processing -> paid | failed
 *   paid -> refunded
 * 禁止: failed/cancelled/refunded/expired -> paid (不可逆回 paid)
 */
export enum OrderStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  PAID = "paid",
  FAILED = "failed",
  CANCELLED = "cancelled",
  REFUNDED = "refunded",
  EXPIRED = "expired",
}

/** 合法状态转换表 (唯一来源) */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [
    OrderStatus.PROCESSING,
    OrderStatus.FAILED,
    OrderStatus.CANCELLED,
    OrderStatus.EXPIRED,
  ],
  [OrderStatus.PROCESSING]: [OrderStatus.PAID, OrderStatus.FAILED],
  [OrderStatus.PAID]: [OrderStatus.REFUNDED],
  [OrderStatus.FAILED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REFUNDED]: [],
  [OrderStatus.EXPIRED]: [],
};

export function canTransitionOrderStatus(from: string, to: string): boolean {
  const allowed = ORDER_STATUS_TRANSITIONS[from as OrderStatus] ?? [];
  return (allowed as string[]).includes(to);
}
