import type { AdminBusinessSetting } from "~/types/admin";

/**
 * 业务参数的中文说明与编辑方式。
 *
 * 说明以 GET /admin/business-settings 实际返回为准; 未知 key 走兜底说明, 不假装认识它。
 * 这里只有「展示元数据」(说明 / 编辑器类型 / 单位), 不含任何参数默认值 —— 默认值属于后端。
 */
export interface BusinessSettingSpec {
  description: string;
  editor: "number" | "boolean" | "text";
  unit?: string;
}

const BUSINESS_SETTING_SPECS: Record<string, BusinessSettingSpec> = {
  refund_window_hours: {
    description:
      "退款保护期 (小时): 支付成功后的这段时间内退款会立即冲正佣金, 佣金保持「保护期」状态。",
    editor: "number",
    unit: "小时",
  },
  commission_settlement_days: {
    description: "佣金结算天数: 满足结算条件后需间隔多少天才能结算。",
    editor: "number",
    unit: "天",
  },
  partner_enabled: {
    description: "是否开放 Partner 推广计划 (关闭后用户无法申请成为 Partner)。",
    editor: "boolean",
  },
  lifetime_partner_required: {
    description: "申请 Partner 是否必须为长期会员 (开启 = 仅长期会员可申请)。",
    editor: "boolean",
  },
  order_expire_minutes: {
    description: "订单未支付自动过期时间 (分钟)。",
    editor: "number",
    unit: "分钟",
  },
  currency: {
    description: "计价币种 (三位字母代码, 例如 CNY)。",
    editor: "text",
  },
};

const DEFAULT_SPEC: BusinessSettingSpec = {
  description: "后端返回的业务参数, 暂无中文说明 —— 修改前请先确认其含义。",
  editor: "text",
};

export function describeBusinessSetting(key: string): BusinessSettingSpec {
  return BUSINESS_SETTING_SPECS[key] ?? DEFAULT_SPEC;
}

/**
 * 系统级密钥 / 连接串在后台不可编辑。
 * 业务参数表本身只存业务配置, 这里是深度防御: 即使将来有人把这类 key 写进表里,
 * 页面也不会给出编辑入口。
 */
const FORBIDDEN_KEY_PATTERNS = [
  /(^|_)(url|uri|dsn)(_|$)/i,
  /(^|_)(secret|token|password|passwd|key|credential|privatekey)(_|$)/i,
  /^logto/i,
];

export function isEditableBusinessSetting(key: string): boolean {
  const normalized = String(key ?? "");
  return !FORBIDDEN_KEY_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** 布尔型业务参数的取值 (后端以字符串 "true"/"false" 存储) */
export function isBooleanSettingValue(value: string | null | undefined): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

/** 参数排序: 已有中文说明的参数按说明顺序在前, 未知参数按 key 排在后 */
export function sortBusinessSettings(rows: AdminBusinessSetting[]): AdminBusinessSetting[] {
  const knownOrder = Object.keys(BUSINESS_SETTING_SPECS);
  return [...rows].sort((a, b) => {
    const indexA = knownOrder.indexOf(a.key);
    const indexB = knownOrder.indexOf(b.key);
    if (indexA === -1 && indexB === -1) return a.key.localeCompare(b.key);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
}
