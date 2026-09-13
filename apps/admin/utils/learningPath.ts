import type { AdminLearningPathItemRow } from "~/types/admin";
import type { StatusTone } from "~/utils/status";

/**
 * 学习路线的展示与排序辅助。
 *
 * 边界 (与后端的关系):
 *  - isPublished 是唯一权威字段, 这里只把 true/false 翻译成文案与色调;
 *  - 发布/下架的合法性完全由后端决定 (PATCH .../publish 幂等), 前端不做判断;
 *  - 上移/下移只计算相邻两条要写成的 order, 由页面逐条发**既有**的单条 PATCH,
 *    不存在任何批量排序接口 (见 utils/reorder.ts)。
 */

export interface LearningPathPresentation {
  label: string;
  tone: StatusTone;
}

export function presentLearningPathPublished(
  isPublished: boolean | null | undefined,
): LearningPathPresentation {
  if (isPublished === true) return { label: "已发布", tone: "success" };
  if (isPublished === false) return { label: "未发布", tone: "neutral" };
  return { label: "未知", tone: "neutral" };
}

/** 发布状态过滤下拉 (取值对应后端 isPublished 查询参数: 只认 true/false) */
export const LEARNING_PATH_PUBLISHED_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "全部状态 (含未发布)" },
  { value: "true", label: "已发布" },
  { value: "false", label: "未发布" },
];

/**
 * 新条目默认排到末尾: max(order) + 1。
 * 不传 order 时后端会算同样的值, 这里只是让表单预填一个可见的默认值。
 */
export function nextPathItemOrder(
  items: readonly Pick<AdminLearningPathItemRow, "order">[],
): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((item) => Number(item.order) || 0)) + 1;
}
