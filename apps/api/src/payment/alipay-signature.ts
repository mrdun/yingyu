import {
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  timingSafeEqual,
} from "node:crypto";

/**
 * 支付宝 RSA2 (SHA256withRSA) 签名/验签 (官方规则)。
 *
 * 1) 参数按 key 字典序升序排列
 * 2) 排除 sign / sign_type 与空值
 * 3) 拼接 key=value&... (值为 URL 解码后的原始值)
 * 4) 使用商户私钥 RSA-SHA256 签名, base64 编码
 *
 * 异步通知验签使用「支付宝公钥」; 响应报文验签使用响应节点 JSON 原文。
 */

const PRIVATE_KEY_HEADERS = [
  ["-----BEGIN RSA PRIVATE KEY-----", "-----END RSA PRIVATE KEY-----"],
  ["-----BEGIN PRIVATE KEY-----", "-----END PRIVATE KEY-----"],
] as const;

const PUBLIC_KEY_HEADERS = [
  ["-----BEGIN PUBLIC KEY-----", "-----END PUBLIC KEY-----"],
  ["-----BEGIN RSA PUBLIC KEY-----", "-----END RSA PUBLIC KEY-----"],
] as const;

function wrapPem(base64: string, headers: readonly (readonly [string, string])[]): string[] {
  const body = base64.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return headers.map(([begin, end]) => `${begin}\n${lines.join("\n")}\n${end}\n`);
}

/** 兼容三种配置写法: 完整 PEM / 含 \n 转义的 PEM / base64 (PKCS1 或 PKCS8) */
export function normalizePrivateKeyCandidates(value: string): string[] {
  if (!value) return [];
  if (value.includes("BEGIN")) {
    return [value.replace(/\\n/g, "\n")];
  }
  return wrapPem(value, PRIVATE_KEY_HEADERS);
}

export function normalizePublicKeyCandidates(value: string): string[] {
  if (!value) return [];
  if (value.includes("BEGIN")) {
    return [value.replace(/\\n/g, "\n")];
  }
  return wrapPem(value, PUBLIC_KEY_HEADERS);
}

/** 选出可用的私钥 PEM (签不出错的那个) */
export function resolvePrivateKey(value: string): string | null {
  for (const candidate of normalizePrivateKeyCandidates(value)) {
    try {
      createPrivateKey(candidate);
      return candidate;
    } catch {
      // 试下一个封装格式
    }
  }
  return null;
}

export function resolvePublicKey(value: string): string | null {
  for (const candidate of normalizePublicKeyCandidates(value)) {
    try {
      createPublicKey(candidate);
      return candidate;
    } catch {
      // 试下一个封装格式
    }
  }
  return null;
}

/** 待签名串 (字典序, 排除 sign/sign_type 与空值) */
export function alipaySignContent(
  params: Record<string, string | number | null | undefined>,
): string {
  return Object.entries(params)
    .filter(([key]) => key !== "sign" && key !== "sign_type")
    .filter(([, value]) => value !== undefined && value !== null && `${value}` !== "")
    .map(([key, value]) => [key, String(value)] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

/** RSA2 签名 (base64) */
export function signAlipayParams(
  params: Record<string, string | number | null | undefined>,
  privateKeyPem: string,
): string {
  const content = alipaySignContent(params);
  return createSign("RSA-SHA256").update(content, "utf8").sign(privateKeyPem, "base64");
}

/** RSA2 验签 (base64 签名) */
export function verifyAlipayParams(
  params: Record<string, string | number | null | undefined>,
  publicKeyPem: string,
): boolean {
  const signature = params["sign"];
  if (!signature || !publicKeyPem) return false;
  const content = alipaySignContent(params);
  try {
    return createVerify("RSA-SHA256")
      .update(content, "utf8")
      .verify(publicKeyPem, String(signature), "base64");
  } catch {
    return false;
  }
}

/** 常量时间比较 (用于自校验场景) */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * 从支付宝响应原文中截取响应节点的 JSON 原文 (验签对象)。
 * 例如 body: {"alipay_trade_precreate_response":{...},"sign":"..."} → 截取 {..}
 */
export function extractAlipayResponseNode(rawBody: string, nodeKey: string): string | null {
  const marker = `"${nodeKey}"`;
  const markerIndex = rawBody.indexOf(marker);
  if (markerIndex < 0) return null;
  const colonIndex = rawBody.indexOf(":", markerIndex + marker.length);
  if (colonIndex < 0) return null;
  let start = colonIndex + 1;
  while (start < rawBody.length && /\s/.test(rawBody[start])) start++;
  if (rawBody[start] !== "{") return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < rawBody.length; i++) {
    const char = rawBody[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return rawBody.slice(start, i + 1);
    }
  }
  return null;
}

/** 响应验签: 使用响应节点 JSON 原文 + sign 字段 */
export function verifyAlipayResponse(
  rawBody: string,
  nodeKey: string,
  publicKeyPem: string,
): boolean {
  const node = extractAlipayResponseNode(rawBody, nodeKey);
  if (!node) return false;
  let signature: string | undefined;
  try {
    signature = (JSON.parse(rawBody) as { sign?: string }).sign;
  } catch {
    return false;
  }
  if (!signature) return false;
  try {
    return createVerify("RSA-SHA256")
      .update(node, "utf8")
      .verify(publicKeyPem, signature, "base64");
  } catch {
    return false;
  }
}

/** 请求参数 → application/x-www-form-urlencoded 请求体 */
export function buildAlipayRequestBody(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

/** 解析 application/x-www-form-urlencoded 原始报文 (保留原始字符串) */
export function parseAlipayRequestBody(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of raw.split("&")) {
    if (!pair) continue;
    const index = pair.indexOf("=");
    const key = index < 0 ? pair : pair.slice(0, index);
    const value = index < 0 ? "" : pair.slice(index + 1);
    const decodedKey = decodeURIComponent(key.replace(/\+/g, " "));
    result[decodedKey] = decodeURIComponent(value.replace(/\+/g, " "));
  }
  return result;
}
