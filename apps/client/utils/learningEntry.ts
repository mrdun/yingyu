/**
 * 首页「开始学习」目标解析 (纯函数, 可单测)。
 *
 * 开源版核心体验: 打开网站 → 开始学习 → 直接进入默认课程的第一组练习,
 * 不经过课程商城 / 会员页。默认课程与首个学习单元全部由后端返回,
 * 前端不硬编码任何课程 ID。
 */

export interface DefaultLearningEntry {
  id: string;
  title: string;
  accessLevel?: "free" | "membership";
  accessible?: boolean;
  requiresMembership?: boolean;
  firstCourse: { id: string; title: string } | null;
  entryUrl: string | null;
}

export interface StartLearningTarget {
  path: string;
  /** 是否直接进入练习 (而不是课程详情页) */
  directPractice: boolean;
  /** 需要会员才能学习 (仅会员课且无权限时) */
  requiresMembership: boolean;
}

/**
 * 决定「开始学习」跳转目标:
 * 1. 后端给了练习入口 → 直接进入练习 (核心体验);
 * 2. 有默认课程包但没有可学单元 (会员课 / 空课程包) → 进入该课程包详情 (不是会员墙);
 * 3. 接口不可用 → 兜底课程商城, 保证用户永远不会卡在首页。
 */
export function resolveStartLearningTarget(
  entry: DefaultLearningEntry | null,
): StartLearningTarget {
  if (!entry) {
    return { path: "/course-pack", directPractice: false, requiresMembership: false };
  }

  const requiresMembership = Boolean(entry.requiresMembership);
  if (entry.entryUrl) {
    return { path: entry.entryUrl, directPractice: true, requiresMembership: false };
  }

  return { path: `/course-pack/${entry.id}`, directPractice: false, requiresMembership };
}
