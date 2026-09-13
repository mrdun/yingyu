import type { AdminPaymentChannel } from "~/types/admin";

import { adminApi, pathSegment } from "./admin-api";

/**
 * 支付渠道开关。
 * 后端只返回 enabled / configured / 支持方式 —— **绝不返回任何密钥或证书内容**,
 * 前端也不去展示、缓存或推测凭据。
 */

export function fetchPaymentChannels(): Promise<AdminPaymentChannel[]> {
  return adminApi.get<AdminPaymentChannel[]>("/admin/payment-channels");
}

export function updatePaymentChannel(
  provider: string,
  enabled: boolean,
): Promise<AdminPaymentChannel> {
  return adminApi.patch<AdminPaymentChannel>(`/admin/payment-channels/${pathSegment(provider)}`, {
    body: { enabled },
  });
}

/** 渠道展示名 (纯展示文案, 非业务参数) */
const PROVIDER_LABELS: Record<string, string> = {
  wechat: "微信支付",
  alipay: "支付宝",
  mock: "本地模拟支付",
};

export function describeProvider(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}
