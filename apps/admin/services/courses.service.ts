import type {
  AdminCoursePackDetail,
  AdminCoursePackList,
  AdminCoursePackRow,
  AdminCoursePackWritePayload,
  AdminCourseRow,
  AdminCourseWritePayload,
  AdminStatementList,
  AdminStatementRow,
  AdminStatementWritePayload,
  ServerPage,
} from "~/types/admin";

import { adminApi, normalizePageParams, pathSegment } from "./admin-api";

/**
 * 课程中心 (课程包 / 课程 / 语句)。
 *
 * 接口 (全部 @Permissions("admin:access")):
 *  - GET    /admin/course-packs                      课程包列表 (分页 + status/source/accessLevel 过滤)
 *  - GET    /admin/course-packs/:id                  课程包详情 (不限状态; 本批次新增的只读接口)
 *  - POST   /admin/course-packs                      新建课程包 (后端固定 draft + manual)
 *  - PATCH  /admin/course-packs/:id                  编辑标题/描述/封面/排序(order)/访问级别
 *  - PATCH  /admin/course-packs/:id/access-level      free ↔ membership
 *  - PATCH  /admin/course-packs/:id/toggle-free       免费/收费切换 (后端取反 access_level)
 *  - POST   /admin/course-packs/:id/{submit-review,reject,publish,archive,restore}  状态机
 *  - POST   /admin/course-packs/:coursePackId/courses 新建课程
 *  - PATCH  /admin/courses/:courseId                  编辑课程 (含 order 排序)
 *  - DELETE /admin/courses/:courseId                  删除课程
 *  - GET    /admin/courses/:courseId/statements       语句列表 (分页 + order 升序; 本批次新增)
 *  - POST   /admin/courses/:courseId/statements       新建语句
 *  - PATCH  /admin/statements/:statementId            编辑语句 (含 order 排序)
 *  - DELETE /admin/statements/:statementId            删除语句
 *
 * 硬约束: 状态机只有上面 5 个 POST, 前端不做第二套转换规则也不做乐观更新;
 * 排序复用既有单条 PATCH {order} —— 本批次**没有**新增任何批量排序接口。
 */

export interface AdminCoursePackQuery {
  page?: number;
  pageSize?: number;
  /** draft / review / published / archived */
  status?: string;
  /** manual / ai */
  source?: string;
  /** free / membership */
  accessLevel?: string;
}

export interface AdminStatementQuery {
  page?: number;
  pageSize?: number;
}

export function fetchCoursePacks(params: AdminCoursePackQuery = {}): Promise<AdminCoursePackList> {
  const { page, pageSize } = normalizePageParams(params);
  const query: Record<string, unknown> = { page, pageSize };
  if (params.status) query.status = params.status;
  if (params.source) query.source = params.source;
  if (params.accessLevel) query.accessLevel = params.accessLevel;

  return adminApi.get<AdminCoursePackList>("/admin/course-packs", { params: query });
}

/** 归一化为统一的服务端分页投影 (页面复用同一套 loading/empty/error/分页状态机) */
export async function fetchCoursePacksPage(
  params: AdminCoursePackQuery = {},
): Promise<ServerPage<AdminCoursePackRow>> {
  const result = await fetchCoursePacks(params);
  return { items: result.coursePacks ?? [], total: Number(result.total ?? 0) };
}

/** 单个课程包详情: 草稿/待审/已归档都能读, 不存在时后端返回 404 */
export function fetchCoursePackDetail(id: string): Promise<AdminCoursePackDetail> {
  return adminApi.get<AdminCoursePackDetail>(`/admin/course-packs/${pathSegment(id)}`);
}

/** 新建课程包: 后端固定写入 status=draft + source=manual, 不能创建后直接发布 */
export function createCoursePack(
  payload: AdminCoursePackWritePayload & { title: string },
): Promise<AdminCoursePackRow> {
  return adminApi.post<AdminCoursePackRow>("/admin/course-packs", { body: payload });
}

/** 编辑课程包属性 (title/description/cover/order/accessLevel; 后端不改 status) */
export function updateCoursePack(
  id: string,
  payload: AdminCoursePackWritePayload,
): Promise<AdminCoursePackRow> {
  return adminApi.patch<AdminCoursePackRow>(`/admin/course-packs/${pathSegment(id)}`, {
    body: payload,
  });
}

/** 访问级别切换 free ↔ membership (只改访问级别, 不动状态机) */
export function setCoursePackAccessLevel(
  id: string,
  accessLevel: "free" | "membership",
): Promise<AdminCoursePackRow> {
  return adminApi.patch<AdminCoursePackRow>(`/admin/course-packs/${pathSegment(id)}/access-level`, {
    body: { accessLevel },
  });
}

/** 免费/收费切换 (后端语义: 取反 access_level, 返回取反后的 isFree) */
export function toggleCoursePackFree(id: string): Promise<{ id: string; isFree: boolean }> {
  return adminApi.patch<{ id: string; isFree: boolean }>(
    `/admin/course-packs/${pathSegment(id)}/toggle-free`,
  );
}

/* ---------------------------------------------------------------------------
 * 状态机: 前端只调用这 5 个端点。
 * 合法性判定完全在后端 (isLegalCourseStatusTransition) —— 后端拒绝时页面照原样展示错误。
 * --------------------------------------------------------------------------- */

export function submitCoursePackReview(id: string): Promise<AdminCoursePackRow> {
  return adminApi.post<AdminCoursePackRow>(`/admin/course-packs/${pathSegment(id)}/submit-review`);
}

export function rejectCoursePackReview(id: string): Promise<AdminCoursePackRow> {
  return adminApi.post<AdminCoursePackRow>(`/admin/course-packs/${pathSegment(id)}/reject`);
}

export function publishCoursePack(id: string): Promise<AdminCoursePackRow> {
  return adminApi.post<AdminCoursePackRow>(`/admin/course-packs/${pathSegment(id)}/publish`);
}

export function archiveCoursePack(id: string): Promise<AdminCoursePackRow> {
  return adminApi.post<AdminCoursePackRow>(`/admin/course-packs/${pathSegment(id)}/archive`);
}

export function restoreCoursePack(id: string): Promise<AdminCoursePackRow> {
  return adminApi.post<AdminCoursePackRow>(`/admin/course-packs/${pathSegment(id)}/restore`);
}

/* ------------------------------- 课程 ------------------------------- */

export function createCourse(
  coursePackId: string,
  payload: AdminCourseWritePayload & { title: string },
): Promise<AdminCourseRow> {
  return adminApi.post<AdminCourseRow>(`/admin/course-packs/${pathSegment(coursePackId)}/courses`, {
    body: payload,
  });
}

/** 编辑课程; 传 order 即为排序 (不需要任何新增的批量排序接口) */
export function updateCourse(
  courseId: string,
  payload: AdminCourseWritePayload,
): Promise<AdminCourseRow> {
  return adminApi.patch<AdminCourseRow>(`/admin/courses/${pathSegment(courseId)}`, {
    body: payload,
  });
}

export function deleteCourse(courseId: string): Promise<{ id: string; deleted: boolean }> {
  return adminApi.delete<{ id: string; deleted: boolean }>(
    `/admin/courses/${pathSegment(courseId)}`,
  );
}

/* ------------------------------- 语句 ------------------------------- */

export function fetchCourseStatements(
  courseId: string,
  params: AdminStatementQuery = {},
): Promise<AdminStatementList> {
  const { page, pageSize } = normalizePageParams(params);
  return adminApi.get<AdminStatementList>(`/admin/courses/${pathSegment(courseId)}/statements`, {
    params: { page, pageSize },
  });
}

/** 归一化为统一的服务端分页投影 */
export async function fetchCourseStatementsPage(
  courseId: string,
  params: AdminStatementQuery = {},
): Promise<ServerPage<AdminStatementRow>> {
  const result = await fetchCourseStatements(courseId, params);
  return { items: result.items ?? [], total: Number(result.total ?? 0) };
}

export function createStatement(
  courseId: string,
  payload: AdminStatementWritePayload & { chinese: string; english: string },
): Promise<AdminStatementRow> {
  return adminApi.post<AdminStatementRow>(`/admin/courses/${pathSegment(courseId)}/statements`, {
    body: payload,
  });
}

/** 编辑语句; 传 order 即为排序 (不需要任何新增的批量排序接口) */
export function updateStatement(
  statementId: string,
  payload: AdminStatementWritePayload,
): Promise<AdminStatementRow> {
  return adminApi.patch<AdminStatementRow>(`/admin/statements/${pathSegment(statementId)}`, {
    body: payload,
  });
}

export function deleteStatement(statementId: string): Promise<{ id: string; deleted: boolean }> {
  return adminApi.delete<{ id: string; deleted: boolean }>(
    `/admin/statements/${pathSegment(statementId)}`,
  );
}
