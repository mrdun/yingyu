/**
 * 统一的展示格式化工具。
 *
 * 业务硬约束: 所有价格/佣金比例都来自 API, 前端不得硬编码。
 * 本文件只做「分 → 元」的换算与展示, 不含任何具体金额/比例常量。
 */

/** 后端所有金额字段单位都是「分」 */
const FEN_PER_YUAN = 100;

/**
 * 佣金比例的唯一换算基数: 后端以整数 basis point (bps) 存储, 100 bps = 1%。
 * 比例同样只来自 API — 页面不得写死任何具体比例, 只能通过下面两个函数换算。
 */
const BPS_PER_PERCENT = 100;

/** bps 合法区间 [0, 10000] (100% = 10000 bps), 与后端 check 约束一致 */
const MAX_BPS = 10000;

/** 数据缺失时的统一占位符 (后端没有的指标不许编造数字) */
export const MISSING_TEXT = "—";

export function isMissing(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/** 分 → "¥12.34" (金额只来自 API) */
export function formatYuanFromFen(fen: number | null | undefined): string {
  if (isMissing(fen) || Number.isNaN(Number(fen))) return MISSING_TEXT;
  const yuan = Number(fen) / FEN_PER_YUAN;
  return `¥${yuan.toFixed(2)}`;
}

/** 分 → 表单里可编辑的元字符串 ("12.34") */
export function fenToYuanInput(fen: number | null | undefined): string {
  if (isMissing(fen) || Number.isNaN(Number(fen))) return "";
  return (Number(fen) / FEN_PER_YUAN).toFixed(2);
}

/**
 * 表单里的元字符串 → 分 (整数)。
 * 非法输入返回 null, 由调用方展示校验错误 —— 不静默取 0 造成"免费"事故。
 */
export function yuanInputToFen(input: string): number | null {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const fen = Math.round(Number(trimmed) * FEN_PER_YUAN);
  return Number.isInteger(fen) && fen > 0 ? fen : null;
}

/** 整数计数展示 (缺失显示 —) */
export function formatCount(value: number | null | undefined): string {
  if (isMissing(value) || Number.isNaN(Number(value))) return MISSING_TEXT;
  return Number(value).toLocaleString("zh-CN");
}

/** 秒 → 人类可读时长 */
export function formatDurationSeconds(seconds: number | null | undefined): string {
  if (isMissing(seconds) || Number.isNaN(Number(seconds))) return MISSING_TEXT;
  const total = Math.max(0, Math.floor(Number(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  if (minutes > 0) return `${minutes} 分钟`;
  return `${total} 秒`;
}

/** ISO 时间串 → 本地可读时间 */
export function formatDateTime(iso: string | null | undefined): string {
  if (isMissing(iso)) return MISSING_TEXT;
  const date = new Date(String(iso));
  if (Number.isNaN(date.getTime())) return MISSING_TEXT;
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** 会员周期: 天数 → 文案 (null 表示长期有效) */
export function formatDurationDays(days: number | null | undefined): string {
  if (days === null || days === undefined) return "长期有效";
  const value = Number(days);
  if (!Number.isFinite(value) || value <= 0) return MISSING_TEXT;
  return `${value} 天`;
}

/**
 * 后端整数 bps → 人类可读百分比 (2500 → "25%", 3750 → "37.5%")。
 * 页面只允许通过本函数展示佣金比例, 不得自行做除法或写死比例。
 */
export function formatBps(bps: number | null | undefined): string {
  if (isMissing(bps) || Number.isNaN(Number(bps))) return MISSING_TEXT;
  const percent = Number(bps) / BPS_PER_PERCENT;
  const rounded = Number.isInteger(percent) ? percent : Number(percent.toFixed(2));
  return `${rounded}%`;
}

/**
 * 界面输入的百分比 → 后端整数 bps (允许带或不带 % 后缀)。
 * 非法/越界输入返回 null, 由调用方展示校验错误 —— 不静默取 0 造成"零佣金"事故。
 * 只接受最多两位小数: 0.01% 已是 bps 的最小粒度。
 */
export function parsePercentToBps(input: string | number | null | undefined): number | null {
  const raw = String(input ?? "")
    .trim()
    .replace(/%$/, "")
    .trim();
  if (!raw) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;

  const bps = Math.round(Number(raw) * BPS_PER_PERCENT);
  if (!Number.isInteger(bps) || bps < 0 || bps > MAX_BPS) return null;
  return bps;
}
