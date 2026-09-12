import { getHttp } from "./http";

export interface AdminOverview {
  userCount: number;
  activeToday: number;
  coursePackCount: number;
  statementCount: number;
  totalReviewRecords: number;
  todayLearnStatements: number;
}

export interface AdminUserRow {
  userId: string;
  username: string | null;
  createdAt: string | null;
  todayStatements: number;
  totalStatements: number;
  totalDurationSeconds: number;
}

export interface AdminUserList {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminCoursePackRow {
  id: string;
  title: string;
  isFree: boolean;
  courseCount: number;
  statementCount: number;
  createdAt: string;
}

export interface AdminCoursePackList {
  coursePacks: AdminCoursePackRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardOverview {
  revenue: {
    todayFen: number;
    yesterdayFen: number;
    monthFen: number;
    totalFen: number;
    refundFen: number;
    netRevenueFen: number;
  };
  orders: {
    todayCount: number;
    monthCount: number;
    paidCount: number;
    refundedCount: number;
    pendingCount: number;
  };
  memberships: {
    activeCount: number;
    lifetimeCount: number;
    newToday: number;
    newMonth: number;
  };
  partners: {
    activePartners: number;
    referralsToday: number;
    referralsMonth: number;
    commissionPendingFen: number;
    commissionTotalFen: number;
  };
}

export interface DashboardOrderRow {
  orderId: string;
  userId: string;
  planName: string | null;
  amountFen: number;
  status: string;
  provider: string;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
}

export interface DashboardOrderList {
  items: DashboardOrderRow[];
  total: number;
  page: number;
  limit: number;
}

export interface DashboardPartnerStats {
  activePartners: number;
  referrals: { total: number; today: number; month: number };
  conversion: { paidUsers: number; conversionRate: number };
  commission: {
    holdingFen: number;
    pendingFen: number;
    payableFen: number;
    paidFen: number;
    reversedFen: number;
    totalFen: number;
  };
}

export interface AdminPlanRow {
  id: string;
  name: string;
  priceFen: number;
  durationDays: number | null;
  sortOrder: number;
  isActive: boolean;
  isPublic: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/** 会员计划可写字段 (价格/周期/排序/上下架/公开销售) */
export interface AdminPlanPayload {
  id?: string;
  name?: string;
  priceFen?: number;
  durationDays?: number | null;
  sortOrder?: number;
  isActive?: boolean;
  isPublic?: boolean;
}

export interface BusinessSettingRow {
  key: string;
  value: string;
  updatedAt: string | null;
}

/** 会员计划商业健康检查 (生产安全检查) */
export interface AdminPlansHealth {
  ok: boolean;
  plansTotal: number;
  purchasablePlans: number;
  warnings: string[];
}

export async function fetchAdminOverview() {
  const http = getHttp();
  return await http<AdminOverview>("/admin/overview", { method: "get" });
}

export async function fetchAdminUsers(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
}) {
  const http = getHttp();
  return await http<AdminUserList>("/admin/users", { method: "get", params });
}

export async function fetchAdminCoursePacks(params: { page?: number; pageSize?: number }) {
  const http = getHttp();
  return await http<AdminCoursePackList>("/admin/course-packs", { method: "get", params });
}

export async function toggleCoursePackFree(id: string) {
  const http = getHttp();
  return await http<{ id: string; isFree: boolean }>(`/admin/course-packs/${id}/toggle-free`, {
    method: "patch",
  });
}

export async function fetchDashboardOverview() {
  const http = getHttp();
  return await http<DashboardOverview>("/admin/dashboard/overview", { method: "get" });
}

export async function fetchDashboardOrders(params: {
  status?: string;
  provider?: string;
  planId?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  const http = getHttp();
  return await http<DashboardOrderList>("/admin/dashboard/orders", { method: "get", params });
}

export async function fetchDashboardPartners() {
  const http = getHttp();
  return await http<DashboardPartnerStats>("/admin/dashboard/partners", { method: "get" });
}

/** 管理端会员计划 (含未公开/已下架) */
export async function fetchAdminPlans() {
  const http = getHttp();
  return await http<AdminPlanRow[]>("/admin/plans", { method: "get" });
}

export async function fetchAdminPlansHealth() {
  const http = getHttp();
  return await http<AdminPlansHealth>("/admin/plans/health", { method: "get" });
}

export async function createAdminPlan(
  payload: AdminPlanPayload & { id: string; name: string; priceFen: number },
) {
  const http = getHttp();
  return await http<AdminPlanRow>("/admin/plans", { method: "post", body: payload });
}

export async function updateAdminPlan(id: string, payload: AdminPlanPayload) {
  const http = getHttp();
  return await http<AdminPlanRow>(`/admin/plans/${id}`, { method: "patch", body: payload });
}

export async function deleteAdminPlan(id: string) {
  const http = getHttp();
  return await http<{ id: string; deleted: boolean }>(`/admin/plans/${id}`, { method: "delete" });
}

/** 商业参数统一配置中心 */
export async function fetchBusinessSettings() {
  const http = getHttp();
  return await http<BusinessSettingRow[]>("/admin/business-settings", { method: "get" });
}

export async function updateBusinessSetting(key: string, value: string) {
  const http = getHttp();
  return await http<{ key: string; value: string }>(`/admin/business-settings/${key}`, {
    method: "patch",
    body: { value },
  });
}

/** 支付渠道 (仅开关状态与凭据是否配置; 不含任何密钥) */
export interface AdminPaymentChannel {
  provider: string;
  enabled: boolean;
  configured: boolean;
  methods: Array<{ method: string; provider: string; label: string; qr: boolean }>;
}

export async function fetchPaymentChannels() {
  const http = getHttp();
  return await http<AdminPaymentChannel[]>("/admin/payment-channels", { method: "get" });
}

export async function updatePaymentChannel(provider: string, enabled: boolean) {
  const http = getHttp();
  return await http<AdminPaymentChannel>(`/admin/payment-channels/${provider}`, {
    method: "patch",
    body: { enabled },
  });
}
