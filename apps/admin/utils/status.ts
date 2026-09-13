import type {
  CommissionStatusValue,
  DependencyState,
  HealthStatus,
  OrderStatusValue,
  PartnerStatusValue,
} from "~/types/admin";

/** UI 基元使用的语义色调 (StatusBadge 的 tone) */
export type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

export interface StatusPresentation {
  label: string;
  tone: StatusTone;
}

const DEPENDENCY_STATES: Record<DependencyState, StatusPresentation> = {
  ok: { label: "正常", tone: "success" },
  fail: { label: "异常", tone: "error" },
  skipped: { label: "未检查", tone: "neutral" },
};

const HEALTH_STATES: Record<HealthStatus, StatusPresentation> = {
  ok: { label: "ok", tone: "success" },
  degraded: { label: "degraded", tone: "warning" },
  fail: { label: "fail", tone: "error" },
};

/** 订单状态展示 (状态本身来自后端, 前端只翻译文案与色调) */
const ORDER_STATES: Record<OrderStatusValue, StatusPresentation> = {
  pending: { label: "待支付", tone: "warning" },
  processing: { label: "支付处理中", tone: "info" },
  paid: { label: "已支付", tone: "success" },
  refunding: { label: "退款中", tone: "warning" },
  refunded: { label: "已退款", tone: "neutral" },
  failed: { label: "支付失败", tone: "error" },
  cancelled: { label: "已取消", tone: "neutral" },
  expired: { label: "已过期", tone: "neutral" },
};

/** Partner 生命周期展示 */
const PARTNER_STATES: Record<PartnerStatusValue, StatusPresentation> = {
  pending: { label: "待审核", tone: "warning" },
  active: { label: "已启用", tone: "success" },
  suspended: { label: "已暂停", tone: "warning" },
  rejected: { label: "已拒绝", tone: "error" },
};

/** 佣金状态展示 (holding → pending → payable → paid, 任意态可 reversed) */
const COMMISSION_STATES: Record<CommissionStatusValue, StatusPresentation> = {
  holding: { label: "保护期", tone: "info" },
  pending: { label: "待确认", tone: "warning" },
  payable: { label: "可结算", tone: "warning" },
  paid: { label: "已结算", tone: "success" },
  reversed: { label: "已冲正", tone: "error" },
};

/** 依赖健康状态 (database / redis / logto) */
export function presentDependencyState(state: DependencyState | undefined): StatusPresentation {
  return (state && DEPENDENCY_STATES[state]) || { label: "未知", tone: "neutral" };
}

/** 整体健康状态 (ok / degraded / fail) */
export function presentHealthStatus(status: HealthStatus | undefined): StatusPresentation {
  return (status && HEALTH_STATES[status]) || { label: "未知", tone: "neutral" };
}

/** 布尔 → 启用/停用标签 */
export function presentEnabled(enabled: boolean | undefined): StatusPresentation {
  if (enabled === true) return { label: "已启用", tone: "success" };
  if (enabled === false) return { label: "已停用", tone: "neutral" };
  return { label: "未知", tone: "neutral" };
}

/**
 * 支付渠道凭据是否齐全。
 * 后端只返回布尔值 configured —— 前端不接触、不展示、不推断任何密钥内容。
 */
export function presentConfigured(configured: boolean | undefined): StatusPresentation {
  if (configured === true) return { label: "凭据已配置", tone: "success" };
  if (configured === false) return { label: "凭据缺失", tone: "error" };
  return { label: "未知", tone: "neutral" };
}

/** 支付渠道 = 开关状态 + 凭据是否配置 (两者都满足才算可用) */
export function presentChannelReadiness(
  enabled: boolean | undefined,
  configured: boolean | undefined,
): StatusPresentation {
  if (enabled === true && configured === true) return { label: "可用", tone: "success" };
  if (enabled === true && configured === false) return { label: "缺少凭据", tone: "error" };
  if (enabled === false) return { label: "已停用", tone: "neutral" };
  return { label: "未知", tone: "neutral" };
}

/** 计划上下架组合 (在售 = 启用 且 公开) */
export function presentPlanVisibility(
  isActive: boolean | undefined,
  isPublic: boolean | undefined,
): StatusPresentation {
  if (isActive === true && isPublic === true) return { label: "在售", tone: "success" };
  if (isActive === true && isPublic === false) return { label: "隐藏", tone: "warning" };
  if (isActive === false) return { label: "已停用", tone: "neutral" };
  return { label: "未知", tone: "neutral" };
}

/** 未知状态一律原样展示后端返回值 (不猜语义), 色调降级为 neutral */
function presentUnknown(raw: string | null | undefined): StatusPresentation {
  return { label: raw ? String(raw) : "未知", tone: "neutral" };
}

/** 订单状态 (pending/processing/paid/refunding/refunded/failed/cancelled/expired) */
export function presentOrderStatus(status: string | null | undefined): StatusPresentation {
  return (status && ORDER_STATES[status as OrderStatusValue]) || presentUnknown(status);
}

/** Partner 状态 (pending/active/suspended/rejected) */
export function presentPartnerStatus(status: string | null | undefined): StatusPresentation {
  return (status && PARTNER_STATES[status as PartnerStatusValue]) || presentUnknown(status);
}

/** 佣金状态 (holding/pending/payable/paid/reversed) */
export function presentCommissionStatus(status: string | null | undefined): StatusPresentation {
  return (status && COMMISSION_STATES[status as CommissionStatusValue]) || presentUnknown(status);
}

/** 佣金规则状态 (active/inactive) */
export function presentRuleStatus(status: string | null | undefined): StatusPresentation {
  if (status === "active") return { label: "已启用", tone: "success" };
  if (status === "inactive") return { label: "已停用", tone: "neutral" };
  return presentUnknown(status);
}
