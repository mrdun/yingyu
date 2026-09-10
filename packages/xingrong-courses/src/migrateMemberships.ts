import { and, eq, isNull } from "drizzle-orm";

import { db } from "@earthworm/db";
import { membership, plans } from "@earthworm/schema";

/**
 * 会员数据迁移: 旧模型 (type + isActive) → 新模型 (plan_id + status + end_date)。
 * 运行：pnpm -F @earthworm/xingrong-courses migrate:memberships
 * 幂等: 只处理 plan_id 为 null 的记录, 可重复执行。
 */
function inferPlanId(durationDays: number): string {
  // 兼容日历月(28~31) 与精确天数(30/90/365)
  if (durationDays >= 27 && durationDays <= 32) return "monthly";
  if (durationDays >= 88 && durationDays <= 93) return "quarterly";
  if (durationDays >= 360 && durationDays <= 370) return "yearly";
  return "legacy_regular";
}

(async function () {
  // 1) 确保 legacy_regular 计划存在 (无法推断时长的 regular 会员兜底, 不对外售卖)
  await db
    .insert(plans)
    .values({
      id: "legacy_regular",
      name: "旧版普通会员",
      priceFen: 0,
      durationDays: null,
      sortOrder: 99,
      isActive: false,
    })
    .onConflictDoNothing({ target: plans.id });

  // 2) founder → lifetime (永久会员, end_date = null)
  await db
    .update(membership)
    .set({ planId: "lifetime", status: "active", end_date: null })
    .where(and(eq(membership.type, "founder"), isNull(membership.planId)));

  // 3) regular → 按 end_date - start_date 推断计划
  const regularMembers = await db
    .select()
    .from(membership)
    .where(and(eq(membership.type, "regular"), isNull(membership.planId)));

  for (const m of regularMembers) {
    const end = m.end_date;
    const planId =
      end == null
        ? "legacy_regular"
        : inferPlanId(Math.round((end.getTime() - m.start_date.getTime()) / (24 * 60 * 60 * 1000)));

    await db
      .update(membership)
      .set({ planId, status: "active" })
      .where(eq(membership.id, m.id));
  }

  console.log(`会员迁移完成: founder 已转 lifetime, regular 已迁移 ${regularMembers.length} 条`);
  process.exit(0);
})();
