import type { AdminOverview, DashboardOverview } from "~/types/admin";

import { adminApi } from "./admin-api";

/** 学习侧概览 (用户数/活跃/课程包/句子/复习) */
export function fetchAdminOverview(): Promise<AdminOverview> {
  return adminApi.get<AdminOverview>("/admin/overview");
}

/** 商业化概览 (收入/订单/会员/伙伴; 金额单位「分」) */
export function fetchDashboardOverview(): Promise<DashboardOverview> {
  return adminApi.get<DashboardOverview>("/admin/dashboard/overview");
}
