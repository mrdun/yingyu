/**
 * 订单状态统一入口 (避免散落字符串)。
 * 状态机:
 *   pending -> processing | failed | cancelled | expired
 *   processing -> paid | failed
 *   paid -> refunding (退款抢占) -> refunded | paid (第三方退款失败回滚)
 * 禁止: failed/cancelled/refunded/expired -> paid (不可逆回 paid)
 */
export enum OrderStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  PAID = "paid",
  REFUNDING = "refunding",
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
  [OrderStatus.PAID]: [OrderStatus.REFUNDING],
  // refunding 只允许收尾 (refunded) 或回滚 (paid, 第三方退款失败时)
  [OrderStatus.REFUNDING]: [OrderStatus.REFUNDED, OrderStatus.PAID],
  [OrderStatus.FAILED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REFUNDED]: [],
  [OrderStatus.EXPIRED]: [],
};

export function canTransitionOrderStatus(from: string, to: string): boolean {
  const allowed = ORDER_STATUS_TRANSITIONS[from as OrderStatus] ?? [];
  return (allowed as string[]).includes(to);
}
