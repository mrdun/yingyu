import { getHttp } from "./http";

export type PartnerStatus = "pending" | "active" | "suspended" | "rejected";

/** 计划级佣金规则 (按 plan 覆盖全局默认) */
export interface PlanCommissionRate {
  planId: string;
  rateBps: number;
  percentage: string;
}

/** 当前生效佣金 (唯一来源: 后端 partner_commission_rules, 前端不做任何计算) */
export interface EffectiveCommission {
  rateBps: number | null;
  percentage: string | null;
  plans: PlanCommissionRate[];
}

export interface PartnerMe {
  isPartner: boolean;
  status: PartnerStatus | null;
  referralCode: string | null;
  commission: EffectiveCommission;
}

export interface AttributeReferralResult {
  attributed: boolean;
  reason?: string;
}

export async function fetchPartnerMe(): Promise<PartnerMe> {
  const http = getHttp();
  return await http<PartnerMe>("/partner/me", { method: "get" });
}

export async function applyPartner() {
  const http = getHttp();
  return await http<PartnerMe>("/partner/apply", { method: "post" });
}

/** 我的邀请记录 (后端已做隐私脱敏: 只返回用户名首字符) */
export interface PartnerReferralRow {
  createdAt: string;
  username: string;
  commissionFen: number;
}

export interface PartnerReferralList {
  count: number;
  referrals: PartnerReferralRow[];
}

/** 我的佣金汇总 (状态与后端 commission_records.status 一致) */
export interface PartnerCommissionSummary {
  totalCommissionFen: number;
  holdingFen: number;
  pendingFen: number;
  payableFen: number;
  paidFen: number;
  reversedFen: number;
  count: number;
}

export async function fetchPartnerReferrals(): Promise<PartnerReferralList> {
  const http = getHttp();
  return await http<PartnerReferralList>("/partner/referrals", { method: "get" });
}

export async function fetchPartnerCommissions(): Promise<PartnerCommissionSummary> {
  const http = getHttp();
  return await http<PartnerCommissionSummary>("/partner/commissions", { method: "get" });
}

/** 归因: 用推广码把当前登录用户归因到 active Partner (幂等, 后端校验) */
export async function attributeReferral(referralCode: string): Promise<AttributeReferralResult> {
  const http = getHttp();
  return await http<AttributeReferralResult>("/partner/attribute", {
    method: "post",
    body: { referralCode },
  });
}
