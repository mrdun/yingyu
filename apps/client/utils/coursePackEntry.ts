/**
 * 课程卡片入口解析 (纯函数, 可单测)。
 *
 * 背景 (P0 缺陷): 课程广场曾经把后端返回的课程包对象**手工裁剪**后传给卡片,
 * 丢掉了 `accessible` 字段。点击决策读到的 `coursePack.accessible` 恒为 undefined,
 * 于是所有课程 (包括免费课) 都被送去 `/membership`。
 *
 * 因此这里约定:
 * 1. 卡片拿到的必须是后端返回的完整对象 (类型里保留 `accessible`), 展示与决策共用一份数据;
 * 2. 点击目标与「是否需要会员」由本文件解析, 页面只负责取数与跳转;
 * 3. **任何**身份、任何 `accessible` 取值下, 课程卡片点击都不会跳 `/membership`
 *    —— 无权限时进入课程详情页 (该页展示会员 CTA), 只有用户在详情页主动点击 CTA 才去会员页。
 *
 * 与 `utils/learningEntry.ts` 同一风格: 纯函数 + 由调用方注入取数, 便于行为测试。
 */

/** 会员身份 (与课程广场 / 课程详情页的 membershipState 一致) */
export type MembershipIdentity = "guest" | "non-member" | "member";

/**
 * 卡片展示/决策需要的课程包字段 (后端返回的超集, 不裁剪)。
 * 字段可选是为了兼容学习路线接口返回的裁剪对象, 但 `accessible` 一旦存在就必须透传。
 */
export interface CoursePackCardModel {
  id: string;
  title?: string | null;
  description?: string | null;
  cover?: string | null;
  isFree?: boolean | null;
  accessLevel?: "free" | "membership" | null;
  accessible?: boolean;
}

export interface CoursePackWithCourses extends CoursePackCardModel {
  courses?: { id: string; order?: number }[] | null;
}

export interface CoursePackTarget {
  path: string;
  /** 是否直接进入练习 (而不是课程包详情页) */
  directPractice: boolean;
  /** 会员课且当前身份无学习权限 (仅用于展示, 不再是跳会员页的理由) */
  requiresMembership: boolean;
}

export interface MembershipCta {
  /** 按钮文案; action 为 none 时为空串 */
  label: string;
  action: "sign-in" | "membership" | "none";
}

/** 课程包详情页地址 (列表点击的落点; 无权时该页展示会员 CTA) */
function coursePackDetailTarget(
  coursePack: CoursePackCardModel | null | undefined,
): CoursePackTarget {
  const id = coursePack?.id;
  if (!id) {
    // 极端情况下连 id 都没有 → 兜底课程商城, 不让用户点出白屏
    return { path: "/course-pack", directPractice: false, requiresMembership: false };
  }
  return {
    path: `/course-pack/${id}`,
    directPractice: false,
    requiresMembership: requiresMembership(coursePack),
  };
}

/**
 * 课程包详情页目标 (卡片点击的兜底 / 无权限落点)。
 *
 * - `accessible === false` (会员课且无权限) → 进入详情页, 由该页展示「会员专享」+ CTA;
 * - `accessible === undefined` (字段缺失, 历史缺陷形态) → 与 false 同样处理: 进入详情页,
 *   **绝不**跳 `/membership` (字段缺失不是判定无权限的理由);
 * - `accessible === true` → 正常场景由 resolveCoursePackCardEntryPath 直达第一课练习,
 *   只有在取数失败 / 包内无课程时才退回到这里。
 */
export function resolveCoursePackCardTarget(
  coursePack: CoursePackCardModel | null | undefined,
): CoursePackTarget {
  return coursePackDetailTarget(coursePack);
}

/**
 * 卡片动作文案:
 * - 免费课 / 有权限 (accessible === true) → 「立即开始学习」;
 * - 会员课且无权限 (含字段缺失) → 「开通会员解锁」。
 */
export function resolveCoursePackCardActionLabel(
  coursePack: CoursePackCardModel | null | undefined,
): string {
  if (isFreeCoursePack(coursePack) || coursePack?.accessible === true) {
    return "立即开始学习";
  }
  return "开通会员解锁";
}

/**
 * 课程广场卡片点击的编排入口 (P1: 「立即开始学习」必须真的立即开始)。
 *
 * - `accessible === true` (免费课 / 有权限的会员课) → 取一次课程包详情,
 *   直接进入第一课练习 `/game/<packId>/<courseId>` (复用 resolveCoursePackFirstLessonPath,
 *   不再写一套取数/取第一课逻辑);
 * - `accessible === false` / 字段缺失 / 取数失败 / 包内无课程 → 课程包详情页
 *   (现状行为; 会员 CTA 展示在那里, **绝不**跳 /membership)。
 *
 * 注意: 只有后端明确返回 `accessible === true` 才直达练习。
 * 字段缺失时保守地退到详情页 —— 详情页本身能开始学习, 用户不会卡住。
 */
export async function resolveCoursePackCardEntryPath(
  loadCoursePack: (coursePackId: string) => Promise<CoursePackWithCourses | null | undefined>,
  coursePack: CoursePackCardModel | null | undefined,
): Promise<CoursePackTarget> {
  const detailTarget = coursePackDetailTarget(coursePack);
  const coursePackId = coursePack?.id;
  // 没有明确权限 / 连 id 都没有 → 不取数, 直接走详情页兜底 (也不打无意义的请求)
  if (!coursePackId || coursePack?.accessible !== true) {
    return detailTarget;
  }
  const id: string = coursePackId;

  return resolveCoursePackFirstLessonPath(() => loadCoursePack(id), id);
}

/**
 * 学习路线条目点击目标: 直接进入该课程包第一课的练习 `/game/<packId>/<courseId>`。
 * 课程包缺 courses / 无课程时退化为课程包详情页 (现状行为), 不报错也不卡住。
 */
export function resolveCoursePackFirstLessonTarget(
  coursePack: CoursePackWithCourses | null | undefined,
): CoursePackTarget {
  const detailTarget = coursePackDetailTarget(coursePack);
  const firstCourse = firstCourseByOrder(coursePack?.courses);
  if (!firstCourse || detailTarget.path === "/course-pack") return detailTarget;

  return {
    path: `/game/${coursePack!.id}/${firstCourse.id}`,
    directPractice: true,
    requiresMembership: detailTarget.requiresMembership,
  };
}

/**
 * 学习路线条目的编排入口: 取课程包 → 解析第一课练习地址。
 * 学习路线的条目数据只有「课程包 + stage 文案」, 没有 courseId, 所以必须取一次详情;
 * 请求失败 / 返回空 / 包内无课程都退化为课程包详情页, 不影响用户继续操作。
 */
export async function resolveCoursePackFirstLessonPath(
  loadCoursePack: () => Promise<CoursePackWithCourses | null | undefined>,
  coursePackId: string,
): Promise<CoursePackTarget> {
  const fallback: CoursePackTarget = {
    path: `/course-pack/${coursePackId}`,
    directPractice: false,
    requiresMembership: false,
  };

  try {
    const coursePack = await loadCoursePack();
    if (!coursePack) return fallback;
    return resolveCoursePackFirstLessonTarget({
      ...coursePack,
      id: coursePack.id || coursePackId,
    });
  } catch {
    return fallback;
  }
}

/**
 * 会员 CTA 文案与动作 (课程包详情页):
 * - 游客 → 「登录后解锁」并走 signIn();
 * - 已登录非会员 → 「开通会员解锁」并进入会员页;
 * - 会员 → 不展示 CTA (直接可学)。
 */
export function resolveMembershipCta(identity: MembershipIdentity): MembershipCta {
  if (identity === "member") return { label: "", action: "none" };
  if (identity === "guest") return { label: "登录后解锁", action: "sign-in" };
  return { label: "开通会员解锁", action: "membership" };
}

/** 免费判定与卡片一致: accessLevel 优先, 缺失时回退 isFree */
function isFreeCoursePack(coursePack: CoursePackCardModel | null | undefined): boolean {
  if (coursePack?.accessLevel) return coursePack.accessLevel === "free";
  return coursePack?.isFree === true;
}

/** 只有显式 accessible === false 且是会员课才算无权限; undefined 不当作无权限 */
function requiresMembership(coursePack: CoursePackCardModel | null | undefined): boolean {
  if (coursePack?.accessible === true) return false;
  return !isFreeCoursePack(coursePack);
}

/** 按 order 升序取第一篇 (order 缺失的排到最后, 不影响取到有 order 的课程) */
function firstCourseByOrder(
  courses: { id: string; order?: number }[] | null | undefined,
): { id: string } | null {
  if (!Array.isArray(courses) || courses.length === 0) return null;

  const withId = courses.filter((course) => Boolean(course?.id));
  if (withId.length === 0) return null;

  return [...withId].sort((a, b) => courseOrder(a.order) - courseOrder(b.order))[0];
}

function courseOrder(order?: number): number {
  return typeof order === "number" && Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER;
}
