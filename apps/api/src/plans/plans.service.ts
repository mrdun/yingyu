import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";

import { planEntitlements, plans } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";

/**
 * 会员计划查询 service (数据库驱动)。
 * 兼容层: 当前 hardcode 的 MEMBERSHIP_PLANS / findPlan 保持不变,
 * 本 service 提供等价的数据库查询, 供后续 (TASK-002-B-03) 切换到 DB plans。
 */
@Injectable()
export class PlansService {
  constructor(@Inject(DB) private db: DbType) {}

  async findAll() {
    return await this.db.query.plans.findMany({
      orderBy: asc(plans.sortOrder),
    });
  }

  async findById(planId: string) {
    return await this.db.query.plans.findFirst({
      where: eq(plans.id, planId),
    });
  }

  async getPlanEntitlements(planId: string) {
    return await this.db.query.planEntitlements.findMany({
      where: eq(planEntitlements.planId, planId),
    });
  }
}
