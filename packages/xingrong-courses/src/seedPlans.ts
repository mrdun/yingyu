import { db } from "@earthworm/db";
import { planEntitlements, plans } from "@earthworm/schema";

/**
 * 预置默认会员计划 (数据库驱动)。
 * 运行：pnpm -F @earthworm/xingrong-courses seed:plans
 * 仅用于初始化/本地开发；上线后价格以管理员后台 (/admin/plans) 为准，幂等，可重复执行。
 */
(async function () {
  const seedPlans = [
    { id: "monthly", name: "月度会员", priceFen: 1800, durationDays: 30, sortOrder: 1 },
    { id: "quarterly", name: "季度会员", priceFen: 4800, durationDays: 90, sortOrder: 2 },
    { id: "yearly", name: "年度会员", priceFen: 16800, durationDays: 365, sortOrder: 3 },
    // 注意: 当前代码无「永久会员」价格, 此处为占位价格 (¥199), 上线前需确认
    { id: "lifetime", name: "永久会员", priceFen: 19900, durationDays: null, sortOrder: 4 },
  ] as const;

  for (const plan of seedPlans) {
    await db
      .insert(plans)
      .values({
        id: plan.id,
        name: plan.name,
        priceFen: plan.priceFen,
        durationDays: plan.durationDays,
        sortOrder: plan.sortOrder,
      })
      .onConflictDoUpdate({
        target: plans.id,
        set: {
          name: plan.name,
          priceFen: plan.priceFen,
          durationDays: plan.durationDays,
          sortOrder: plan.sortOrder,
          updatedAt: new Date(),
        },
      });

    // 默认权益: 会员可访问全部课程
    await db
      .insert(planEntitlements)
      .values({
        planId: plan.id,
        entitlementKey: "course_access",
        entitlementValue: "all",
      })
      .onConflictDoNothing({
        target: [planEntitlements.planId, planEntitlements.entitlementKey],
      });
  }

  console.log(`已预置 ${seedPlans.length} 个会员计划 (含默认权益 course_access=all)`);
  process.exit(0);
})();
