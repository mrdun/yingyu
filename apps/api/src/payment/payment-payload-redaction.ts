/**
 * 支付回调报文脱敏 (入库审计用)。
 *
 * 目的: 保留对账所需的订单/金额/状态字段, 但不落库用户支付隐私标识
 * (微信 openid, 支付宝 buyer_id / buyer_logon_id 等)。
 * 幂等性不受影响: payment_events.payload_hash 仍基于 **未脱敏的原始报文** 计算。
 */

/** 需要脱敏的字段名 (消息体与查询串通用) */
const SENSITIVE_KEYS = [
  "openid",
  "sub_openid",
  "sub_appid_openid",
  "payer",
  "buyer_id",
  "buyer_user_id",
  "buyer_open_id",
  "buyer_logon_id",
];

function mask(value: string): string {
  const clean = value.trim();
  if (clean.length === 0) return clean;
  if (clean.length <= 2) return "***";
  return `${clean.slice(0, 2)}***`;
}

/** 脱敏 XML 报文 (微信 v2): <openid>xxx</openid> / <openid><![CDATA[xxx]]></openid> */
function redactXml(raw: string): string {
  let result = raw;
  for (const key of SENSITIVE_KEYS) {
    const pattern = new RegExp(`(<${key}>)([\\s\\S]*?)(</${key}>)`, "g");
    result = result.replace(pattern, (_match, open, value, close) => {
      const cdata = /^<!\[CDATA\[[\s\S]*\]\]>$/.test(value.trim());
      const inner = cdata ? value.trim().slice(9, -3) : value;
      return `${open}${cdata ? `<![CDATA[${mask(inner)}]]>` : mask(inner)}${close}`;
    });
  }
  return result;
}

/** 脱敏 urlencoded 报文 (支付宝异步通知) */
function redactUrlEncoded(raw: string): string {
  return raw
    .split("&")
    .map((pair) => {
      const index = pair.indexOf("=");
      if (index < 0) return pair;
      const key = pair.slice(0, index);
      const rawValue = pair.slice(index + 1);
      if (!SENSITIVE_KEYS.includes(decodeURIComponent(key))) return pair;
      return `${key}=${mask(decodeURIComponent(rawValue))}`;
    })
    .join("&");
}

/**
 * 按渠道脱敏回调报文。
 * 未识别的渠道直接返回原文 (调用方仍应限制长度)。
 */
export function redactPaymentPayload(raw: string, provider: string): string {
  if (!raw) return raw;
  if (provider === "wechat") return redactXml(raw);
  if (provider === "alipay") return redactUrlEncoded(raw);
  return raw;
}
