import type { AdminMembershipGrowth, MembershipGrantResult } from "~/types/admin";

import { adminApi } from "./admin-api";

/**
 * 会员管理。
 *
 * 接口:
 *  - GET  /admin/dashboard/memberships 会员增长 (按天聚合: 新增会员/永久会员/付费用户)
 *  - POST /admin/memberships/grant     管理员「授予会员」(body {userId, planId}, 语义化命名已就绪)
 *
 * 约束: 授予会员不产生订单与支付流水, 因此文案统一为「授予会员」—— 不得使用"买/购买"类表述,
 * 那会让人误以为会生成订单与收款记录。
 * 后端目前没有会员列表接口 (见汇报): 本页展示的是日粒度增长, 明细字段缺失时显示「暂无数据」。
 */

export function fetchMembershipGrowth(
  params: { from?: string; to?: string } = {},
): Promise<AdminMembershipGrowth> {
  const query: Record<string, unknown> = {};
  if (params.from) query.from = params.from;
  if (params.to) query.to = params.to;

  return adminApi.get<AdminMembershipGrowth>("/admin/dashboard/memberships", { params: query });
}

/** 管理员赠送会员 (不产生 order/payment) —— 危险操作, 页面必须二次确认 */
export function grantMembership(input: {
  userId: string;
  planId: string;
}): Promise<MembershipGrantResult> {
  return adminApi.post<MembershipGrantResult>("/admin/memberships/grant", {
    body: { userId: input.userId, planId: input.planId },
  });
}
