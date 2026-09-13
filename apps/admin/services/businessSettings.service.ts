import type { AdminBusinessSetting, AdminBusinessSettingUpdate } from "~/types/admin";

import { adminApi, pathSegment } from "./admin-api";

/**
 * 业务参数 (business_settings 的 key-value)。
 * 接口: GET /admin/business-settings、PATCH /admin/business-settings/:key (body {value})
 *
 * 安全边界: 该表只存业务参数 (退款保护期/结算天数/币种等)。
 * 系统级密钥与连接串 (DATABASE_URL / REDIS_URL / LOGTO_* / 支付私钥) 不属于业务参数,
 * 不在该接口返回范围内, 后台也不提供任何编辑入口 —— 页面必须显式说明这一点。
 */

export function fetchBusinessSettings(): Promise<AdminBusinessSetting[]> {
  return adminApi.get<AdminBusinessSetting[]>("/admin/business-settings");
}

/** 更新单个业务参数; value 一律以字符串提交 (后端按 key 语义校验) */
export function updateBusinessSetting(
  key: string,
  value: string,
): Promise<AdminBusinessSettingUpdate> {
  return adminApi.patch<AdminBusinessSettingUpdate>(
    `/admin/business-settings/${pathSegment(key)}`,
    { body: { value } },
  );
}
