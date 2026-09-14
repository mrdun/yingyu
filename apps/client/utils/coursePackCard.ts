/**
 * 课程卡的两种形态 (工作台 / 营销) 与工作台形态的封面、进度文案 —— 纯函数, 可单测。
 *
 * 背景: 同一个 `CoursePackCard.vue` 被两处使用, 外观要求相反:
 *   1. 课程广场 `/course-pack`、学习路线、课程包详情: 营销外壳外观
 *      —— 白卡 + 大圆角 + 暖调阴影 + 「免费/会员专享」徽章 + 胶囊按钮;
 *   2. 会员中心主页 (登录后 `/`) 的「我的课程」: 工作台外观 (DESIGN.md `## Colors` 工作台调色板)
 *      —— 白卡 + 1px #E5E7EB 边 + 圆角 12px + **无阴影** + 渐变封面色块 + 整宽蓝按钮。
 *
 * 所以形态差异收敛成: 一个 `variant` 开关 + 两个 CSS 修饰类 (`--default` / `--wb`),
 * 判定与取值全部走本文件的纯函数, 组件里不内联三目 —— 这样「课程广场原样不动」可以被源码级守卫钉住。
 */

import { clampPercent, safeNumber } from "./memberCenter";

/** 卡片形态: default = 营销外观; workbench = 工作台外观 (会员中心「我的课程」) */
export type CoursePackCardVariant = "default" | "workbench";

/**
 * 形态归一化: **只有显式传 "workbench"** 才切工作台外观。
 * 其余情况 (undefined / null / 拼错 / 大小写不符) 一律回落 default ——
 * 宁可少一次工作台样式, 也不能让课程广场吃到工作台外观。
 */
export function resolveCoursePackCardVariant(variant?: string | null): CoursePackCardVariant {
  return variant === "workbench" ? "workbench" : "default";
}

/** 根节点修饰类 (视觉全在这两个类里, 见 CoursePackCard.vue 的 scoped 样式) */
export function coursePackCardVariantClass(variant?: string | null): string {
  return resolveCoursePackCardVariant(variant) === "workbench"
    ? "course-pack-card--wb"
    : "course-pack-card--default";
}

/**
 * 工作台封面的渐变色块。
 * 只取工作台调色板的冷色系 (wb-accent / wb-accent-deep + 靛蓝/青蓝):
 * 设计稿里的黄色/薄荷绿封面**没有照抄** —— DESIGN.md `## Do's and Don'ts` 规定黄色是奖励色,
 * 不能当装饰色用。
 */
export const WORKBENCH_COVER_GRADIENTS: readonly string[] = [
  "linear-gradient(135deg,#2c5af4,#6f8dff)", // wb-accent
  "linear-gradient(135deg,#2a64e7,#7fa6ff)", // wb-accent-deep
  "linear-gradient(135deg,#4f46e5,#8b93ff)", // 靛蓝
  "linear-gradient(135deg,#0ea5e9,#67d3f7)", // 青蓝
];

/** 封面上居中的 emoji (设计稿: 封面色块 + 大号图标; 沿用项目既有 emoji 方案, 不引图标库) */
export const WORKBENCH_COVER_ICONS: readonly string[] = ["📘", "🎧", "🧩", "✍️"];

/** 工作台形态的进度数据 (GET /course-pack/:id/progress 的子集, 兼容字段缺失) */
export interface CoursePackProgressInput {
  totalCourses?: number | null;
  completedCourses?: number | null;
  progress?: number | null;
}

/** 接口返回的 progress 已经是百分比, 折算时分母固定 100 */
const PERCENT_TOTAL = 100;

/** 按课程包 id 稳定取一个封面渐变 (同一个包每次刷新都是同一张封面, 不是随机) */
export function coursePackCoverGradient(id?: string | null): string {
  return WORKBENCH_COVER_GRADIENTS[stableIndex(id, WORKBENCH_COVER_GRADIENTS.length)];
}

/** 按课程包 id 稳定取一个封面图标 */
export function coursePackCoverIcon(id?: string | null): string {
  return WORKBENCH_COVER_ICONS[stableIndex(id, WORKBENCH_COVER_ICONS.length)];
}

/**
 * 工作台形态的第二行文案: 未开始 → `第 N 课 · 还没开始`; 有进度 → `第 N 课 · xx%`。
 *
 * 数据来源是既有接口 `GET /course-pack/:coursePackId/progress`
 * (totalCourses / completedCourses / progress), 不是编的:
 *   - xx%  = 接口的 `progress` (后端按「完成课程数 / 总课程数」算好的 0–100);
 *   - N    = `completedCourses + 1`, 封顶到 `totalCourses`。
 *     ⚠️ 接口不返回「最近一课在包内的序号」(`lastCourseId` 需要再取一次课程包详情才能定位),
 *     所以 N 是按完成数推出的「当前在学的第几课」, 用户跳课学习时可能与真实课号不一致。
 *     要精确到真实课号需要每张卡多打一次详情请求, 本期不做 (见任务报告)。
 *
 * ⚠️ 没学过时**不能说「0%」**: 设计稿 (`.hermes/design/home-appshell.html`) 对未开始的课
 * 写的是「第 1 课 · **还没开始**」, 而 0% 读起来像「学过了但一点没进展」。
 *
 * 拿不到进度 (没请求到 / 包内没有课程 / 非法值) → 返回空串, 由调用方退化成课程包描述, **不编数字**。
 */
export function formatCoursePackProgressLine(progress?: CoursePackProgressInput | null): string {
  const totalCourses = Math.floor(safeNumber(progress?.totalCourses));
  if (totalCourses <= 0) return "";

  const completedCourses = Math.min(
    Math.max(Math.floor(safeNumber(progress?.completedCourses)), 0),
    totalCourses,
  );
  const lessonNumber = Math.min(completedCourses + 1, totalCourses);
  // 接口给的 progress 本身就是百分比, 所以分母固定 100 (clampPercent 负责收敛 0–100 与非法值)
  const percent = Math.round(clampPercent(progress?.progress, PERCENT_TOTAL));

  if (!hasStartedCoursePack({ completedCourses, progress: percent })) {
    return `第 ${lessonNumber} 课 · 还没开始`;
  }

  return `第 ${lessonNumber} 课 · ${percent}%`;
}

/**
 * 这门课「学过没有」= 完成过至少一课, 或进度百分比大于 0。
 * 卡片第二行与按钮文案共用这一个判定, 免得出现「第二行说还没开始、按钮说继续游戏」这种自相矛盾。
 */
export function hasStartedCoursePack(progress?: CoursePackProgressInput | null): boolean {
  const completedCourses = Math.floor(safeNumber(progress?.completedCourses));
  const percent = clampPercent(progress?.progress, PERCENT_TOTAL);

  return completedCourses > 0 || percent > 0;
}

/** 卡片第二行: 有真实进度就显示进度, 拿不到就退化成课程包描述 (都没有则空串) */
export function resolveCoursePackCardMetaLine(
  description: string | null | undefined,
  progress?: CoursePackProgressInput | null,
): string {
  return formatCoursePackProgressLine(progress) || description || "";
}

/**
 * **工作台形态**的按钮文案 —— 按「学过没有」说话, 与权限无关。
 *
 * 为什么不能用 `resolveCoursePackCardActionLabel` (permission 派生的「立即开始学习 / 开通会员解锁」):
 * 「我的课程」的数据来自 `GET /user-course-progress/recent-course-packs`, 该接口
 * **不返回** `accessLevel` / `accessible`, 于是会员课的 `accessible === undefined`
 * → 落到 `resolveCoursePackCardActionLabel` 的兜底分支 → **给已经能学的用户显示「开通会员解锁」**。
 *
 * 正确语义: 这里列的是「你正在学的课」, 按钮该表达「接着学」而不是「买会员」。
 * 即使某门课的会员权限真的失效了, 点进去也是课程详情页, 由该页展示会员 CTA
 * (见 utils/coursePackEntry.ts 的约定: 卡片点击永不直接跳 /membership) —— 用户不会被误导付费。
 *
 * ⚠️ 判定必须与第二行文案同一个来源 (`hasStartedCoursePack`): 没学过 → 「开始第一课」;
 * 用「第二行非空」当判定会让**每一门有课程的课都显示「继续游戏」**(实测踩过: 全新账号
 * 在「零基础学英语」上看到「继续游戏」, 而设计稿对未开始的课写的是「开始第一课」)。
 *
 * 后端补上 `accessLevel`/`accessible` 之后, 这里可以再考虑是否改回权限派生文案。
 */
export function resolveWorkbenchCardActionLabel(progress?: CoursePackProgressInput | null): string {
  return hasStartedCoursePack(progress) ? "继续游戏" : "开始第一课";
}

/** 字符串 → 稳定下标 (djb2 变体; 空 id 落在 0), 不依赖 Math.random / 时间 */
function stableIndex(id: string | null | undefined, length: number): number {
  if (length <= 0) return 0;

  const key = id ?? "";
  let hash = 0;
  for (let index = 0; index < key.length; index++) {
    hash = (hash * 31 + key.charCodeAt(index)) % 1000003;
  }

  return hash % length;
}
