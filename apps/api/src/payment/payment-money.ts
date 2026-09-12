/**
 * 金额换算 (字符串安全, 避免浮点误差)。
 * 微信使用「分」, 支付宝使用「元(两位小数字符串)」。
 */

/** 元 → 分; 非法金额抛错 (不接受负数/超过两位小数/非数字) */
export function yuanToFen(amount: string | number): number {
  const text = String(amount).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  const [yuan, decimal = ""] = text.split(".");
  return Number(yuan) * 100 + Number(decimal.padEnd(2, "0"));
}

/** 分 → 元字符串 (两位小数) */
export function fenToYuan(fen: number): string {
  const sign = fen < 0 ? "-" : "";
  const abs = Math.abs(fen);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
