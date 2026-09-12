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
