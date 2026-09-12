import { attributeReferral } from "~/api/partner";
import { isAuthenticated } from "~/services/auth";

const REF_STORAGE_KEY = "pending_referral_code";

function canUseStorage() {
  return typeof window !== "undefined";
}

/** 保存待归因的推广码 (点击 ?ref=CODE 时调用) */
export function savePendingReferralCode(code: string) {
  if (!canUseStorage() || !code.trim()) return;
  localStorage.setItem(REF_STORAGE_KEY, code.trim());
}

export function getPendingReferralCode(): string | null {
  if (!canUseStorage()) return null;
  return localStorage.getItem(REF_STORAGE_KEY);
}

export function clearPendingReferralCode() {
  if (!canUseStorage()) return;
  localStorage.removeItem(REF_STORAGE_KEY);
}

/**
 * 登录后自动归因 (幂等, 后端校验 active/自邀请/已归因)。
 * 失败不阻断登录; 成功后清除待归因 code。
 */
export async function attributePendingReferral() {
  if (!isAuthenticated()) return;
  const code = getPendingReferralCode();
  if (!code) return;

  // 先清除, 避免异常时无限重试
  clearPendingReferralCode();
  try {
    await attributeReferral(code);
  } catch {
    // 归因失败不阻断用户正常使用
  }
}
