import type { StatusTone } from "~/utils/status";

import { MISSING_TEXT } from "~/utils/format";

/**
 * 课程中心的状态/来源/访问级别展示, 以及"当前状态可显示哪些动作"。
 *
 * 重要边界 (与后端的关系):
 *  - 这里**只**决定界面上显示哪些按钮, 不是第二套状态机;
 *  - 转换是否合法、是否允许编辑/删除, 全部由后端判定 (isLegalCourseStatusTransition /
 *    assertContentEditable / assertContentDeletable);
 *  - 后端拒绝时页面必须原样展示错误原文 (getErrorMessage), 不做乐观更新、不吞错。
 */

export interface CoursePresentation {
  label: string;
  tone: StatusTone;
}

const COURSE_PACK_STATUS: Record<string, CoursePresentation> = {
  draft: { label: "草稿", tone: "neutral" },
  review: { label: "待审核", tone: "warning" },
  published: { label: "已发布", tone: "success" },
  archived: { label: "已归档", tone: "neutral" },
};

const COURSE_PACK_SOURCE: Record<string, CoursePresentation> = {
  manual: { label: "手工创建", tone: "neutral" },
  ai: { label: "AI 生成", tone: "info" },
};

const ACCESS_LEVEL: Record<string, CoursePresentation> = {
  free: { label: "免费", tone: "success" },
  membership: { label: "会员", tone: "info" },
};

const STATEMENT_SOURCE_TYPE: Record<string, CoursePresentation> = {
  text: { label: "文本", tone: "neutral" },
  audio: { label: "音频", tone: "info" },
  video: { label: "视频", tone: "info" },
};

/** 未知取值一律原样展示后端返回值 (不猜语义), 色调降级为 neutral */
function presentUnknown(raw: string | null | undefined): CoursePresentation {
  return { label: raw ? String(raw) : "未知", tone: "neutral" };
}

export function presentCoursePackStatus(status: string | null | undefined): CoursePresentation {
  return (status && COURSE_PACK_STATUS[status]) || presentUnknown(status);
}

export function presentCoursePackSource(source: string | null | undefined): CoursePresentation {
  return (source && COURSE_PACK_SOURCE[source]) || presentUnknown(source);
}

/**
 * 访问级别展示。
 * accessLevel 是唯一权威字段; isFree 只是后端保留的旧字段 (两者由后端同步),
 * 因此只在 accessLevel 缺失时才回退看 isFree。
 */
export function presentCourseAccessLevel(
  accessLevel: string | null | undefined,
  isFree?: boolean | null,
): CoursePresentation {
  const known = accessLevel ? ACCESS_LEVEL[accessLevel] : undefined;
  if (known) return known;
  if (isFree === true) return { label: "免费", tone: "success" };
  if (isFree === false) return { label: "会员", tone: "info" };
  return presentUnknown(accessLevel);
}

export function presentStatementSourceType(
  sourceType: string | null | undefined,
): CoursePresentation {
  return (sourceType && STATEMENT_SOURCE_TYPE[sourceType]) || presentUnknown(sourceType);
}

/** 时间轴 (毫秒) 展示: 起止都为空时返回占位符 */
export function presentTimeline(
  startMs: number | null | undefined,
  endMs: number | null | undefined,
): string {
  if (startMs === null || startMs === undefined) return MISSING_TEXT;
  const start = `${Number(startMs)}ms`;
  if (endMs === null || endMs === undefined) return `${start} → ${MISSING_TEXT}`;
  return `${start} → ${Number(endMs)}ms`;
}

/* -------------------------------------------------------------------------------- */

/** 状态操作按钮 (只表达"点哪个按钮调哪个端点") */
export type CoursePackAction = "submit-review" | "reject" | "publish" | "archive" | "restore";

export interface CoursePackActionMeta {
  key: CoursePackAction;
  label: string;
  /** AppButton 的 variant */
  variant: "primary" | "outline" | "ghost" | "danger";
  /** 二次确认弹窗的语气 */
  confirmTone: "primary" | "danger";
  /** 二次确认弹窗的正文 */
  confirmMessage: (title: string) => string;
}

const COURSE_PACK_ACTION_META: Record<CoursePackAction, CoursePackActionMeta> = {
  "submit-review": {
    key: "submit-review",
    label: "提交审核",
    variant: "primary",
    confirmTone: "primary",
    confirmMessage: (title) =>
      `将「${title}」提交审核? 提交后进入待审核, 审核通过才能发布。` + `未通过审核前对用户不可见。`,
  },
  reject: {
    key: "reject",
    label: "驳回",
    variant: "ghost",
    confirmTone: "danger",
    confirmMessage: (title) => `驳回「${title}」? 驳回后回到草稿状态, 需要修改后重新提交审核。`,
  },
  publish: {
    key: "publish",
    label: "发布",
    variant: "primary",
    confirmTone: "danger",
    confirmMessage: (title) =>
      `发布「${title}」? 发布后课程包对外可见 (published + public), 用户即可学习。` +
      `发布前请确认内容已审核完毕。`,
  },
  archive: {
    key: "archive",
    label: "归档",
    variant: "danger",
    confirmTone: "danger",
    confirmMessage: (title) =>
      `归档「${title}」? 归档后课程包从课程中心下架, 且内容不能再直接编辑 (需先恢复)。`,
  },
  restore: {
    key: "restore",
    label: "恢复",
    variant: "outline",
    confirmTone: "primary",
    confirmMessage: (title) =>
      `恢复「${title}」? 恢复后回到草稿状态, 需重新提交审核并发布才会再次对外可见。`,
  },
};

/**
 * 当前状态在界面上显示哪些动作 (仅展示层)。
 * - draft:     提交审核
 * - review:    驳回 / 发布
 * - published: 归档
 * - archived:  恢复
 * 未收录的状态返回空数组 —— 宁可少显示按钮, 也不猜后端语义。
 */
const STATUS_ACTIONS: Record<string, CoursePackAction[]> = {
  draft: ["submit-review"],
  review: ["reject", "publish"],
  published: ["archive"],
  archived: ["restore"],
};

export function availableCoursePackActions(
  status: string | null | undefined,
): CoursePackActionMeta[] {
  const actions = (status && STATUS_ACTIONS[status]) || [];
  return actions.map((action) => COURSE_PACK_ACTION_META[action]);
}

/* 过滤下拉项 (取值以后端/schema 为准) */
export const COURSE_PACK_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "全部状态" },
  { value: "draft", label: "草稿" },
  { value: "review", label: "待审核" },
  { value: "published", label: "已发布" },
  { value: "archived", label: "已归档" },
];

export const COURSE_PACK_SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "全部来源" },
  { value: "manual", label: "手工创建" },
  { value: "ai", label: "AI 生成" },
];

export const COURSE_ACCESS_LEVEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "全部访问级别" },
  { value: "free", label: "免费" },
  { value: "membership", label: "会员" },
];
