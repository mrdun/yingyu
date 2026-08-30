/**
 * 会员计划 (Phase 3 第四期, 硬编码常量, 无需新表)
 * 价格单位: 人民币分 (fen)
 */
export interface MembershipPlan {
  id: string; // monthly | quarterly | yearly
  name: string;
  priceFen: number;
  durationDays: number;
  description: string;
}

export const MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    id: "monthly",
    name: "月度会员",
    priceFen: 1800,
    durationDays: 30,
    description: "¥18 / 30天",
  },
  {
    id: "quarterly",
    name: "季度会员",
    priceFen: 4800,
    durationDays: 90,
    description: "¥48 / 90天",
  },
  {
    id: "yearly",
    name: "年度会员",
    priceFen: 16800,
    durationDays: 365,
    description: "¥168 / 365天",
  },
];

export function findPlan(planId: string): MembershipPlan | undefined {
  return MEMBERSHIP_PLANS.find((p) => p.id === planId);
}
