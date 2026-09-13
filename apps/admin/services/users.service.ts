import type { AdminUserList, AdminUserRow, ServerPage } from "~/types/admin";

import { adminApi, normalizePageParams } from "./admin-api";

/**
 * 用户目录 (只读)。
 * 接口: GET /admin/users?page&pageSize&keyword —— 用户身份在 Logto, 后端代理 Management API。
 *
 * 安全约束: 该接口只返回 userId / username / createdAt 与学习统计,
 * **不返回密码、token、Logto secret 等任何凭证**, 页面也不得展示这些内容。
 * 后端未提供的字段 (会员状态 / Partner 状态) 页面显示「暂无数据」, 不猜、不补接口。
 */
export interface AdminUserQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export function fetchAdminUsers(params: AdminUserQuery = {}): Promise<AdminUserList> {
  const { page, pageSize } = normalizePageParams(params);
  const keyword = params.keyword?.trim();
  const query: Record<string, unknown> = { page, pageSize };
  if (keyword) query.keyword = keyword;

  return adminApi.get<AdminUserList>("/admin/users", { params: query });
}

/** 归一化为统一的服务端分页投影 (页面复用同一套 loading/empty/error/分页状态机) */
export async function fetchAdminUsersPage(
  params: AdminUserQuery = {},
): Promise<ServerPage<AdminUserRow>> {
  const result = await fetchAdminUsers(params);
  return { items: result.users ?? [], total: Number(result.total ?? 0) };
}
