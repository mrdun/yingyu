import { getHttp } from "./http";

export type PartnerStatus = "pending" | "active" | "suspended" | "rejected";

export interface PartnerMe {
  isPartner: boolean;
  commissionRateBps: number | null;
  status: PartnerStatus | null;
  referralCode: string | null;
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

/** 归因: 用推广码把当前登录用户归因到 active Partner (幂等, 后端校验) */
export async function attributeReferral(referralCode: string): Promise<AttributeReferralResult> {
  const http = getHttp();
  return await http<AttributeReferralResult>("/partner/attribute", {
    method: "post",
    body: { referralCode },
  });
}
