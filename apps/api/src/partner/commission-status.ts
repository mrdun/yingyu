/**
 * 佣金状态机 (唯一来源)。
 * 状态流:
 *   holding --退款保护期结束--> pending --满足结算条件--> payable --管理员结算--> paid
 *   holding / pending / payable / paid --退款--> reversed
 * 禁止: 任何 -> holding; reversed -> *; paid -> pending; payable -> pending 等回退。
 */
export const COMMISSION_STATUS = {
  HOLDING: "holding",
  PENDING: "pending",
  PAYABLE: "payable",
  PAID: "paid",
  REVERSED: "reversed",
} as const;

export type CommissionStatusValue = (typeof COMMISSION_STATUS)[keyof typeof COMMISSION_STATUS];

export const COMMISSION_STATUS_TRANSITIONS: Record<CommissionStatusValue, CommissionStatusValue[]> =
  {
    holding: [COMMISSION_STATUS.PENDING, COMMISSION_STATUS.REVERSED],
    pending: [COMMISSION_STATUS.PAYABLE, COMMISSION_STATUS.REVERSED],
    payable: [COMMISSION_STATUS.PAID, COMMISSION_STATUS.REVERSED],
    paid: [COMMISSION_STATUS.REVERSED],
    reversed: [],
  };

export function canTransitionCommissionStatus(from: string, to: string): boolean {
  const allowed = COMMISSION_STATUS_TRANSITIONS[from as CommissionStatusValue] ?? [];
  return (allowed as string[]).includes(to);
}
