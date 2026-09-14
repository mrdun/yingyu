/**
 * 会员中心主页 (登录后 `/`) 的纯函数与常量。
 *
 * 为什么单独抽出来:
 *   1. 主页的验收重点之一是**空态** —— 当前账号 0 连续 / 0 打卡 / 0 分钟 / 0 掌握。
 *      所有除法与百分比都必须经过这里, 保证 0 值显示 0 而不是 NaN / Infinity / 空白;
 *   2. 打卡周历的三态语义 (已完成 / 今天 / 未来) 是设计稿的硬要求,
 *      判定写成纯函数才能在源码级守卫里钉住 (见 components/tests/home-member-center.spec.ts)。
 */

/** 千句进度目标: 「用你的注意力填满 1000 个句子」 */
export const SENTENCE_GOAL = 1000;

/** 一周七天的短标签 (周一起, 与打卡周历同序) */
export const WEEK_DAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"] as const;

/** 打卡周历单格的语义 (设计稿: 已完成=浅蓝填充+✓ / 今天=蓝底实心 / 未来=虚线空框) */
export type WeekDayState = "done" | "today" | "future" | "missing";

/**
 * 接口字段可能缺失 / null / 字符串数字 —— 统一收敛成有限数字。
 * 任何参与运算的值都必须先过这里, 避免 `undefined / 10 * 100` 之类的 NaN 流到模板。
 */
export function safeNumber(value: unknown, fallback = 0): number {
  // `?? fallback` 兜住 undefined/null, Number.isFinite 再兜住 "abc" 这类转不动的值
  const raw = value ?? fallback;
  const num = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

/** 百分比 (0–100), 分母 <= 0 时返回 0 (空态不产生 NaN) */
export function clampPercent(value: unknown, total: unknown): number {
  const denominator = safeNumber(total);
  if (denominator <= 0) return 0;

  const percent = (safeNumber(value) / denominator) * 100;
  if (!Number.isFinite(percent)) return 0;

  return Math.min(100, Math.max(0, percent));
}

/** 进度条宽度 (空态是合法的 "0%", 不是空字符串) */
export function progressWidth(value: unknown, total: unknown): string {
  return `${clampPercent(value, total)}%`;
}

/** 百分比文案: 0 → "0%", 满格 → "100%", 其余保留一位小数 (如 "26.4%") */
export function formatPercent(value: unknown, total: unknown): string {
  const percent = clampPercent(value, total);
  if (percent === 0) return "0%";
  if (percent === 100) return "100%";

  return `${percent.toFixed(1)}%`;
}

/** 计数文案 (千分位): 0 → "0", 非法值 → "0" */
export function formatCount(value: unknown): string {
  return Math.floor(safeNumber(value)).toLocaleString("en-US");
}

/** 秒 → 整分钟 (不足 1 分钟记 0, 空态显示 0 分钟) */
export function secondsToMinutes(seconds: unknown): number {
  return Math.floor(safeNumber(seconds) / 60);
}

/** 累计学习时长文案: 0 → "0 分钟" */
export function formatDuration(seconds: unknown): string {
  const minutes = secondsToMinutes(seconds);
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (hours > 0) return `${hours} 小时 ${restMinutes} 分`;
  return `${minutes} 分钟`;
}

/**
 * 打卡周历单格状态。
 * date / today 都是 `YYYY-MM-DD` (同宽度, 可直接按字典序比较大小)。
 */
export function resolveWeekDayState(
  date: string,
  today: string,
  checkedInDates: readonly string[] = [],
): WeekDayState {
  if (checkedInDates.includes(date)) return "done";
  if (date === today) return "today";
  if (date > today) return "future";

  return "missing";
}

/** 柱状图单根柱子高度 (%), 空态 (全 0) 返回 0 —— 由调用方决定是否补一个最小可见高度 */
export function barPercent(value: unknown, max: unknown): number {
  const peak = safeNumber(max);
  if (peak <= 0) return 0;

  return clampPercent(Math.max(0, safeNumber(value)), peak);
}

/** 问候语 (按小时): 只接小时数, 便于纯函数单测 */
export function greetingForHour(hour: unknown): string {
  const h = safeNumber(hour);
  if (h < 5) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";

  return "晚上好";
}
