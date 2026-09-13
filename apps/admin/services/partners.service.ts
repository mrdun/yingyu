import type { AdminPartnerRow } from "~/types/admin";

import { adminApi, pathSegment } from "./admin-api";

/**
 * 推广伙伴 (Partner)。
 * 接口: GET /admin/partners、GET /admin/partners/:id、
 *       POST /admin/partners/:id/{approve,reject,suspend,activate}
 *
 * 后端已剔除 partners.commission_rate(_bps) 旧字段 —— 佣金比例唯一来源是 /admin/commission-rules,
 * 页面不展示、也不推断 Partner 上的比例。
 * 四个动作都改变推广资格与结算关系, 全部需要二次确认 (由调用页面负责)。
 */

/** 动作名与后端路由一一对应 (字面量联合, 防止拼出任意子路径) */
const PARTNER_ACTIONS = {
  approve: "approve",
  reject: "reject",
  suspend: "suspend",
  activate: "activate",
} as const;

export type PartnerAction = keyof typeof PARTNER_ACTIONS;

export function fetchPartners(): Promise<AdminPartnerRow[]> {
  return adminApi.get<AdminPartnerRow[]>("/admin/partners");
}

export function fetchPartner(id: string): Promise<AdminPartnerRow> {
  return adminApi.get<AdminPartnerRow>(`/admin/partners/${pathSegment(id)}`);
}

export function applyPartnerAction(id: string, action: PartnerAction): Promise<AdminPartnerRow> {
  return adminApi.post<AdminPartnerRow>(
    `/admin/partners/${pathSegment(id)}/${PARTNER_ACTIONS[action]}`,
  );
}
