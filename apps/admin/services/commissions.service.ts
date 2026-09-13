import type {
  AdminCommissionList,
  AdminCommissionRow,
  CommissionConfirmResult,
  ServerPage,
} from "~/types/admin";

import { adminApi, normalizePageParams, pathSegment } from "./admin-api";

/**
 * 佣金管理。
 *
 * 接口:
 *  - GET  /admin/commissions            佣金流水 (本批次新增: 分页 + status 过滤, 只读)
 *  - POST /admin/commissions/confirm    到期的 holding → pending (幂等批处理)
 *  - POST /admin/commissions/:id/payable pending → payable
 *  - POST /admin/commissions/:id/settle  payable → paid (结算, 不含提现)
 *
 * 硬约束: 金额 (commissionFen / orderAmountFen) 与比例 (rateBps) 全部来自后端快照,
 * 前端既不计算也不推断状态; 状态推进只允许通过上面 3 个 POST, 并以接口返回值为准。
 */
export interface AdminCommissionQuery {
  page?: number;
  pageSize?: number;
  /** 状态过滤, 取值以 schema 约束为准: holding / pending / payable / paid / reversed */
  status?: string;
}

export function fetchCommissions(params: AdminCommissionQuery = {}): Promise<AdminCommissionList> {
  const { page, pageSize } = normalizePageParams(params);
  const query: Record<string, unknown> = { page, pageSize };
  if (params.status) query.status = params.status;

  return adminApi.get<AdminCommissionList>("/admin/commissions", { params: query });
}

/** 归一化为统一的服务端分页投影 */
export async function fetchCommissionsPage(
  params: AdminCommissionQuery = {},
): Promise<ServerPage<AdminCommissionRow>> {
  const result = await fetchCommissions(params);
  return { items: result.items ?? [], total: Number(result.total ?? 0) };
}

/** 批量: 退款保护期结束的 holding 佣金 → pending (幂等) */
export function confirmExpiredCommissions(): Promise<CommissionConfirmResult> {
  return adminApi.post<CommissionConfirmResult>("/admin/commissions/confirm");
}

/** pending → payable */
export function markCommissionPayable(id: string): Promise<AdminCommissionRow> {
  return adminApi.post<AdminCommissionRow>(`/admin/commissions/${pathSegment(id)}/payable`);
}

/** payable → paid (管理员结算, 不含提现) */
export function settleCommission(id: string): Promise<AdminCommissionRow> {
  return adminApi.post<AdminCommissionRow>(`/admin/commissions/${pathSegment(id)}/settle`);
}
