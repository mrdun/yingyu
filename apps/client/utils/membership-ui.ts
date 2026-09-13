/**
 * 会员页展示逻辑 (纯函数, 便于测试)。
 *
 * 硬性约束: 所有价格/权益/佣金数据来自后端 API, 这里只做展示计算与文案映射,
 * 不包含任何硬编码价格或佣金比例。
 */

export interface PlanEntitlement {
  key: string;
  value: string;
}

export interface DisplayPlan {
  id: string;
  name: string;
  priceFen: number;
  durationDays: number | null;
  entitlements: PlanEntitlement[];
}

/** 权益文案映射 (仅做 key → 文案翻译; 未知 key 回退到原始值, 保证后台新增权益不崩) */
const ENTITLEMENT_LABELS: Record<string, (value: string) => string> = {
  course_access: (value) => (value === "all" ? "全部课程无限畅学" : `课程访问权限: ${value}`),
  ai_daily_quota: (value) => `每日 AI 生成额度 ${value} 次`,
};

export function describeEntitlement(entitlement: PlanEntitlement): string {
  const label = ENTITLEMENT_LABELS[entitlement.key];
  return label ? label(entitlement.value) : `${entitlement.key}: ${entitlement.value}`;
}

export function describeEntitlements(entitlements: PlanEntitlement[]): string[] {
  return entitlements.map(describeEntitlement);
}

/** 分 → 展示价 (整数元不显示小数, 保留两位小数上限) */
export function formatYuan(fen: number): string {
  const yuan = Number(fen) / 100;
  return Number.isInteger(yuan) ? `${yuan}` : yuan.toFixed(2);
}

/** 每天成本 (分); 永久方案或无时长方案返回 null */
export function dailyPriceFen(plan: DisplayPlan): number | null {
  if (!plan.durationDays || plan.durationDays <= 0) return null;
  return Math.round(plan.priceFen / plan.durationDays);
}

/**
 * 推荐方案: 有限时长里"每天成本最低"的一个 (数据驱动, 不写死 yearly)。
 * 只有一个有限方案或数据不足时返回 null (不强行推荐)。
 */
export function pickRecommendedPlan(plans: DisplayPlan[]): DisplayPlan | null {
  const candidates = plans.filter((plan) => dailyPriceFen(plan) !== null);
  if (candidates.length < 2) return null;
  return candidates.reduce((best, plan) =>
    (dailyPriceFen(plan) as number) < (dailyPriceFen(best) as number) ? plan : best,
  );
}

/** 永久方案 (durationDays 为空) */
export function pickLifetimePlan(plans: DisplayPlan[]): DisplayPlan | null {
  return plans.find((plan) => plan.durationDays === null) ?? null;
}

/**
 * 相对月付的节省金额 (分) 与折扣比例; 数据不足或没有更便宜时返回 null。
 * 仅用于对比展示, 不构成价格承诺。
 */
export function compareWithMonthly(
  plan: DisplayPlan,
  monthlyPlan: DisplayPlan | null,
): { savedFen: number; discountPercent: number } | null {
  if (!monthlyPlan || !plan.durationDays || !monthlyPlan.durationDays) return null;
  const months = plan.durationDays / monthlyPlan.durationDays;
  if (!Number.isFinite(months) || months < 1.5) return null; // 仅对比明显更长的方案
  const monthlyCost = Math.round(monthlyPlan.priceFen * months);
  const savedFen = monthlyCost - plan.priceFen;
  if (savedFen <= 0) return null;
  return {
    savedFen,
    discountPercent: Math.round((savedFen / monthlyCost) * 100),
  };
}

/** 推广收益示例: 佣金 = 订单金额 × 比例 (整数分, 向下取整, 与后端一致) */
export function commissionExampleFen(
  orderAmountFen: number,
  rateBps: number | null,
): number | null {
  if (rateBps === null || rateBps === undefined || rateBps <= 0) return null;
  return Math.floor((orderAmountFen * rateBps) / 10000);
}

/** 佣金状态展示 (与后端 commission_records.status 一致) */
export const COMMISSION_STATUS_TEXT: Record<string, { label: string; description: string }> = {
  holding: { label: "保护期内", description: "订单在退款保护期内, 暂不可结算" },
  pending: { label: "等待结算", description: "保护期已过, 等待满足结算条件" },
  payable: { label: "可结算", description: "已满足结算条件, 等待打款" },
  paid: { label: "已结算", description: "已完成结算" },
  reversed: { label: "已撤销", description: "对应订单已退款, 佣金已撤销" },
};

export function describeCommissionStatus(status: string) {
  return COMMISSION_STATUS_TEXT[status] ?? { label: status, description: "状态说明待补充" };
}

/** 支付阶段 (钱包/渠道只决定展示, 状态判定以服务端订单状态为准) */
export type PaymentStage = "idle" | "waiting" | "success" | "failed" | "expired";

export const ORDER_STATUS_TO_STAGE: Record<string, PaymentStage> = {
  pending: "waiting",
  processing: "waiting",
  paid: "success",
  failed: "failed",
  cancelled: "expired",
  expired: "expired",
  refunded: "failed",
};

export function paymentStageOf(orderStatus: string): PaymentStage {
  return ORDER_STATUS_TO_STAGE[orderStatus] ?? "waiting";
}
