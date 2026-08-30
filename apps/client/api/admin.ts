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
