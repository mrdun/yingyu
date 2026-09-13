import type { AdminPlanPayload, AdminPlanRow, AdminPlansHealth } from "~/types/admin";

import { adminApi, pathSegment } from "./admin-api";

/**
 * 会员方案 (价格唯一来源是后端 /admin/plans)。
 * 页面不得出现任何具体金额常量 —— 全部由这些接口返回值渲染。
 */

export function fetchPlans(): Promise<AdminPlanRow[]> {
  return adminApi.get<AdminPlanRow[]>("/admin/plans");
}

/** 商业化健康检查: plans 为空/无在售方案时后端会给出 warnings */
export function fetchPlansHealth(): Promise<AdminPlansHealth> {
  return adminApi.get<AdminPlansHealth>("/admin/plans/health");
}

export interface CreatePlanInput {
  id: string;
  name: string;
  priceFen: number;
  durationDays?: number | null;
  sortOrder?: number;
  isActive?: boolean;
  isPublic?: boolean;
}

export function createPlan(input: CreatePlanInput): Promise<AdminPlanRow> {
  return adminApi.post<AdminPlanRow>("/admin/plans", { body: input });
}

export function updatePlan(id: string, payload: AdminPlanPayload): Promise<AdminPlanRow> {
  return adminApi.patch<AdminPlanRow>(`/admin/plans/${pathSegment(id)}`, { body: payload });
}

export function deletePlan(id: string): Promise<{ id: string; deleted: boolean }> {
  return adminApi.delete<{ id: string; deleted: boolean }>(`/admin/plans/${pathSegment(id)}`);
}

/** 排序调整: 与相邻方案交换 sortOrder (返回两次 PATCH 的入参) */
export interface PlanOrderChange {
  id: string;
  sortOrder: number;
}

export function buildReorderPayloads(
  plans: AdminPlanRow[],
  index: number,
  direction: -1 | 1,
): PlanOrderChange[] | null {
  const targetIndex = index + direction;
  if (index < 0 || index >= plans.length) return null;
  if (targetIndex < 0 || targetIndex >= plans.length) return null;

  const current = plans[index];
  const neighbor = plans[targetIndex];
  if (!current || !neighbor) return null;

  // 相邻两项 sortOrder 相同时也要能分开: 用数组下标作为兜底序号
  const currentOrder = neighbor.sortOrder === current.sortOrder ? targetIndex : neighbor.sortOrder;
  const neighborOrder = neighbor.sortOrder === current.sortOrder ? index : current.sortOrder;

  return [
    { id: current.id, sortOrder: currentOrder },
    { id: neighbor.id, sortOrder: neighborOrder },
  ];
}
