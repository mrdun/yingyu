/**
 * 订单状态统一入口 (避免散落字符串)。
 * 状态机: pending -> paid | failed | cancelled; paid -> refunded
 */
export enum OrderStatus {
  PENDING = "pending",
  PAID = "paid",
  FAILED = "failed",
  CANCELLED = "cancelled",
  REFUNDED = "refunded",
}
