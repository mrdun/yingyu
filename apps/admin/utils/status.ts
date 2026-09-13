import type { DependencyState, HealthStatus } from "~/types/admin";

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
