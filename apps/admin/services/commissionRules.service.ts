import type { AdminCommissionRule, AdminCommissionRulePayload } from "~/types/admin";

import { adminApi, pathSegment } from "./admin-api";

/**
 * 佣金规则 (partner_commission_rules)。
 * 接口: GET /admin/commission-rules、POST /admin/commission-rules、PATCH /admin/commission-rules/:id
 *
 * 比例以整数 bps 存储/提交 (rateBps)。页面只能通过 utils/format.ts 的
 * parsePercentToBps / formatBps 与百分比互转, 不得自行做除法或写死比例。
 * 规则变更只影响之后的订单: 历史佣金使用生成时的 rate_bps 快照, 前端不做任何补偿写入。
 */

export function fetchCommissionRules(): Promise<AdminCommissionRule[]> {
  return adminApi.get<AdminCommissionRule[]>("/admin/commission-rules");
}

export function createCommissionRule(
  payload: AdminCommissionRulePayload,
): Promise<AdminCommissionRule> {
  return adminApi.post<AdminCommissionRule>("/admin/commission-rules", { body: payload });
}

export function updateCommissionRule(
  id: string,
  payload: AdminCommissionRulePayload,
): Promise<AdminCommissionRule> {
  return adminApi.patch<AdminCommissionRule>(`/admin/commission-rules/${pathSegment(id)}`, {
    body: payload,
  });
}
