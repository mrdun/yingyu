import type {
  AdminOrderDetail,
  AdminOrderList,
  AdminOrderRow,
  OrderReconcileResult,
  OrderRefundResult,
  ServerPage,
} from "~/types/admin";

import { adminApi, normalizePageParams, pathSegment } from "./admin-api";

/**
 * 订单管理。
 *
 * 接口选择说明 (只用既有接口, 不新增后端):
 *  - 列表: GET /admin/dashboard/orders —— 后端**唯一**带 total 的订单列表接口
 *          (`GET /admin/orders` 只有 limit, 没有 page/total, 无法做真实服务端分页)。
 *          金额/状态/渠道/时间线全部来自返回值, 前端不做任何状态推断。
 *  - 详情: GET /admin/orders/:id
 *  - 运维动作: POST /admin/orders/:orderId/reconcile (异常订单对账)
 *              POST /admin/orders/:orderId/refund (退款, 页面必须二次确认)
 *
 * 前端**绝不**自行变更订单状态: 页面只展示接口返回的 status, 动作成功后重新拉取。
 */
export interface AdminOrderQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  provider?: string;
  userId?: string;
}

export function fetchOrders(params: AdminOrderQuery = {}): Promise<AdminOrderList> {
  const { page, limit } = normalizePageParams(params);
  const query: Record<string, unknown> = { page, limit };
  if (params.status) query.status = params.status;
  if (params.provider) query.provider = params.provider;
  if (params.userId) query.userId = params.userId;

  return adminApi.get<AdminOrderList>("/admin/dashboard/orders", { params: query });
}

/** 归一化为统一的服务端分页投影 */
export async function fetchOrdersPage(
  params: AdminOrderQuery = {},
): Promise<ServerPage<AdminOrderRow>> {
  const result = await fetchOrders(params);
  return { items: result.items ?? [], total: Number(result.total ?? 0) };
}

export function fetchOrder(orderId: string): Promise<AdminOrderDetail> {
  return adminApi.get<AdminOrderDetail>(`/admin/orders/${pathSegment(orderId)}`);
}

/** 异常订单对账 (回调丢失兜底): 后端可能推进状态, 前端以返回值为准并重新拉列表 */
export function reconcileOrder(orderId: string): Promise<OrderReconcileResult> {
  return adminApi.post<OrderReconcileResult>(`/admin/orders/${pathSegment(orderId)}/reconcile`);
}

/** 管理员退款 (唯一退款入口): 会退款 + 撤销会员权益 + 冲正佣金, 必须二次确认 */
export function refundOrder(orderId: string): Promise<OrderRefundResult> {
  return adminApi.post<OrderRefundResult>(`/admin/orders/${pathSegment(orderId)}/refund`);
}
