/**
 * Partner 生命周期状态机 (唯一来源)。
 * 转换:
 *   pending -> active | rejected
 *   active -> suspended
 *   suspended -> active
 */
export const PARTNER_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  REJECTED: "rejected",
} as const;

export type PartnerStatusValue = (typeof PARTNER_STATUS)[keyof typeof PARTNER_STATUS];

export const PARTNER_STATUS_TRANSITIONS: Record<PartnerStatusValue, PartnerStatusValue[]> = {
  pending: [PARTNER_STATUS.ACTIVE, PARTNER_STATUS.REJECTED],
  active: [PARTNER_STATUS.SUSPENDED],
  suspended: [PARTNER_STATUS.ACTIVE],
  rejected: [],
};

export function canTransitionPartnerStatus(from: string, to: string): boolean {
  const allowed = PARTNER_STATUS_TRANSITIONS[from as PartnerStatusValue] ?? [];
  return (allowed as string[]).includes(to);
}
