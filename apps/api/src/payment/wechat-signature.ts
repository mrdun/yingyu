import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * 微信支付 v2 签名/验签 (官方规则)。
 *
 * 1) 参数按参数名 ASCII 字典序升序排列
 * 2) 排除 sign 与空值参数
 * 3) 拼接 key=value&...&key=API_KEY (API_KEY 为商户 API 密钥)
 * 4) MD5(或 HMAC-SHA256) 后转大写
 *
 * 说明: v2 报文为 XML; 验签必须基于 **原始 XML 报文** 解析出的参数,
 * 不允许把对象重新序列化后验签。
 */

export type WechatSignType = "MD5" | "HMAC-SHA256";

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripCdata(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("<![CDATA[") && trimmed.endsWith("]]>")) {
    return trimmed.slice("<![CDATA[".length, -"]]>".length);
  }
  return unescapeXml(trimmed);
}

/** 生成微信 v2 XML 报文 (数值字段必须为整数, 不传空值) */
export function buildWechatXml(fields: Record<string, string | number | null | undefined>): string {
  const body = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && `${value}` !== "")
    .map(([key, value]) => `<${key}>${escapeXml(String(value))}</${key}>`)
    .join("");
  return `<xml>${body}</xml>`;
}

/**
 * 解析微信 v2 XML (单层结构)。
 * 仅用于 v2 的扁平报文; 字段值支持 CDATA 与实体转义。
 */
export function parseWechatXml(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const root = xml.replace(/^\uFEFF/, "").trim();
  const body = root.replace(/^<\?xml[^>]*\?>/, "").trim();
  const inner = body.replace(/^<xml[^>]*>/, "").replace(/<\/xml>$/, "");
  const tagPattern = /<([A-Za-z0-9_]+)>(?:([\s\S]*?)<\/\1>)?/g;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(inner)) !== null) {
    const key = match[1];
    const rawValue = match[2];
    if (rawValue === undefined) continue; // 自闭合/无值标签 (例如 <xml/>)
    result[key] = stripCdata(rawValue);
  }
  return result;
}

/** 拼接微信签名串 (不含 sign, 不含空值) */
export function wechatSignString(
  params: Record<string, string | number | null | undefined>,
  apiKey: string,
): string {
  const pairs = Object.entries(params)
    .filter(([key]) => key !== "sign")
    .filter(([, value]) => value !== undefined && value !== null && `${value}` !== "")
    .map(([key, value]) => [key, String(value)] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const joined = pairs.map(([key, value]) => `${key}=${value}`).join("&");
  return `${joined}&key=${apiKey}`;
}

/** 计算微信签名 (返回大写) */
export function wechatSign(
  params: Record<string, string | number | null | undefined>,
  apiKey: string,
  signType: WechatSignType = "MD5",
): string {
  const content = wechatSignString(params, apiKey);
  const digest =
    signType === "HMAC-SHA256"
      ? createHmac("sha256", apiKey).update(content, "utf8").digest("hex")
      : createHash("md5").update(content, "utf8").digest("hex");
  return digest.toUpperCase();
}

/** 常量时间比较签名 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * 验签: params 必须来自原始报文的解析结果。
 * sign_type 缺省为 MD5 (微信默认)。
 */
export function verifyWechatSign(params: Record<string, string>, apiKey: string): boolean {
  const received = params["sign"];
  if (!received || !apiKey) return false;
  const signType: WechatSignType = params["sign_type"] === "HMAC-SHA256" ? "HMAC-SHA256" : "MD5";
  const expected = wechatSign(params, apiKey, signType);
  return safeEqual(expected, received.trim().toUpperCase());
}

/** 金额换算 (元 ↔ 分) 见 payment-money.ts */
export { fenToYuan, yuanToFen } from "./payment-money";
