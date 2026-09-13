import type {
  AdminLearningPathDetail,
  AdminLearningPathItemRow,
  AdminLearningPathItemWritePayload,
  AdminLearningPathList,
  AdminLearningPathRow,
  AdminLearningPathWritePayload,
  CoursePackOption,
  ServerPage,
} from "~/types/admin";

import { MAX_PAGE_SIZE, adminApi, normalizePageParams, pathSegment } from "./admin-api";
import { fetchCoursePacks } from "./courses.service";

/**
 * 学习路线 (编排课程包的学习顺序)。
 *
 * 接口 (全部 @Permissions("admin:access")):
 *  - GET    /admin/learning-paths                  全部路线 (含未发布) + 分页 + isPublished 过滤
 *  - GET    /admin/learning-paths/:id              详情 + 条目 (含 coursePackTitle)
 *  - POST   /admin/learning-paths                  新建路线 (后端固定 isPublished=false)
 *  - PATCH  /admin/learning-paths/:id              改标题/描述/封面/排序
 *  - PATCH  /admin/learning-paths/:id/publish      发布 / 下架 (幂等)
 *  - DELETE /admin/learning-paths/:id              删除路线 (后端事务内连带删除条目)
 *  - POST   /admin/learning-paths/:id/items        添加条目 (重复课程包 → 409)
 *  - PATCH  /admin/learning-path-items/:itemId     改条目 (阶段/排序/课程包, 重复 → 409)
 *  - DELETE /admin/learning-path-items/:itemId     删除条目
 *
 * 公开接口 (GET /learning-path) 的可见性不变: 游客/会员仍只看到已发布路线 ——
 * 本文件所有请求都走管理端前缀, 不碰公开接口。
 */

export interface AdminLearningPathQuery {
  page?: number;
  pageSize?: number;
  /** true 只看已发布 / false 只看未发布 / undefined 全部 (管理端默认看全部) */
  isPublished?: boolean;
}

export function fetchLearningPaths(
  params: AdminLearningPathQuery = {},
): Promise<AdminLearningPathList> {
  const { page, pageSize } = normalizePageParams(params);
  const query: Record<string, unknown> = { page, pageSize };
  if (params.isPublished !== undefined) query.isPublished = String(params.isPublished);

  return adminApi.get<AdminLearningPathList>("/admin/learning-paths", { params: query });
}

/** 归一化为统一的服务端分页投影 (页面复用同一套 loading/empty/error/分页状态机) */
export async function fetchLearningPathsPage(
  params: AdminLearningPathQuery = {},
): Promise<ServerPage<AdminLearningPathRow>> {
  const result = await fetchLearningPaths(params);
  return { items: result.items ?? [], total: Number(result.total ?? 0) };
}

/** 单个路线详情: 未发布的路线也能读 (管理端必须能编排自己的草稿) */
export function fetchLearningPathDetail(id: string): Promise<AdminLearningPathDetail> {
  return adminApi.get<AdminLearningPathDetail>(`/admin/learning-paths/${pathSegment(id)}`);
}

/** 新建路线: 后端固定 isPublished=false, 需要显式发布才对用户可见 */
export function createLearningPath(
  payload: AdminLearningPathWritePayload & { title: string },
): Promise<AdminLearningPathRow> {
  return adminApi.post<AdminLearningPathRow>("/admin/learning-paths", { body: payload });
}

/** 编辑路线属性 (title/description/cover/order; 不改发布状态) */
export function updateLearningPath(
  id: string,
  payload: AdminLearningPathWritePayload,
): Promise<AdminLearningPathRow> {
  return adminApi.patch<AdminLearningPathRow>(`/admin/learning-paths/${pathSegment(id)}`, {
    body: payload,
  });
}

/** 发布 / 下架 (幂等: 重复设置同一个值仍是 200) */
export function setLearningPathPublished(
  id: string,
  isPublished: boolean,
): Promise<AdminLearningPathRow> {
  return adminApi.patch<AdminLearningPathRow>(`/admin/learning-paths/${pathSegment(id)}/publish`, {
    body: { isPublished },
  });
}

/** 删除路线 (后端事务内先删条目再删路线; 课程包本身不受影响) */
export function deleteLearningPath(id: string): Promise<{ id: string; deleted: boolean }> {
  return adminApi.delete<{ id: string; deleted: boolean }>(
    `/admin/learning-paths/${pathSegment(id)}`,
  );
}

/* ------------------------------ 条目编排 ------------------------------ */

export function addLearningPathItem(
  learningPathId: string,
  payload: AdminLearningPathItemWritePayload & { coursePackId: string },
): Promise<AdminLearningPathItemRow> {
  return adminApi.post<AdminLearningPathItemRow>(
    `/admin/learning-paths/${pathSegment(learningPathId)}/items`,
    { body: payload },
  );
}

/** 编辑条目; 传 order 即为排序 (与课程/语句排序同一做法, 没有批量端点) */
export function updateLearningPathItem(
  itemId: string,
  payload: AdminLearningPathItemWritePayload,
): Promise<AdminLearningPathItemRow> {
  return adminApi.patch<AdminLearningPathItemRow>(
    `/admin/learning-path-items/${pathSegment(itemId)}`,
    { body: payload },
  );
}

export function deleteLearningPathItem(itemId: string): Promise<{ id: string; deleted: boolean }> {
  return adminApi.delete<{ id: string; deleted: boolean }>(
    `/admin/learning-path-items/${pathSegment(itemId)}`,
  );
}

/**
 * 条目编排用的课程包下拉数据。
 *
 * 复用课程中心**既有**的列表接口 (services/courses.service.ts 的 fetchCoursePacks),
 * 按分页把全部课程包取回来 —— 本批次没有新增任何课程包接口。
 * 上限兜底: 万一后端 total 异常, 最多拉 100 页 (100 × 100 条), 不会死循环。
 */
export async function fetchCoursePackOptions(): Promise<CoursePackOption[]> {
  const MAX_PAGES = 100;
  const pageSize = MAX_PAGE_SIZE;
  const collected: CoursePackOption[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await fetchCoursePacks({ page, pageSize });
    const rows = result.coursePacks ?? [];
    for (const row of rows) {
      collected.push({ id: row.id, title: row.title, status: row.status });
    }

    // 不足一页说明已经到最后一页; 或已覆盖 total
    if (rows.length < pageSize) break;
    if (collected.length >= Number(result.total ?? 0)) break;
  }

  return collected;
}
