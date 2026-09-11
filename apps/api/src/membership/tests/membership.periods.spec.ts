import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";

import { membership, membershipPeriod, orders, planEntitlements, plans, user } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { PartnerService } from "../../partner/partner.service";
import { MembershipService } from "../membership.service";

const DAY = 24 * 60 * 60 * 1000;

async function seedPlans(db: DbType) {
  const rows = [
    { id: "monthly", name: "月度会员", priceFen: 1800, durationDays: 30 },
    { id: "quarterly", name: "季度会员", priceFen: 4800, durationDays: 90 },
    { id: "yearly", name: "年度会员", priceFen: 16800, durationDays: 365 },
    { id: "lifetime", name: "永久会员", priceFen: 19900, durationDays: null },
  ] as const;
  for (const p of rows) {
    await db.insert(plans).values({
      id: p.id,
      name: p.name,
      priceFen: p.priceFen,
      durationDays: p.durationDays,
      sortOrder: 1,
    });
  }
}

describe("Membership periods (order refund attribution)", () => {
  let db: DbType;
  let service: MembershipService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [MembershipService, PartnerService],
    }).compile();
    db = module.get<DbType>(DB);
    service = module.get<MembershipService>(MembershipService);
  });

  beforeEach(async () => {
    await cleanDB(db);
    await db.delete(planEntitlements);
    await db.delete(membershipPeriod);
    await db.delete(plans);
    await seedPlans(db);
  });

  afterAll(async () => {
    await cleanDB(db);
    await db.delete(planEntitlements);
    await db.delete(membershipPeriod);
    await db.delete(plans);
    await db.delete(user);
    await endDB();
  });

  async function buy(userId: string, planId: string, providerOrderId: string) {
    await db.insert(user).values({ id: userId }).onConflictDoNothing();
    const order = await service.createOrder({
      userId,
      planId,
      amountFen: 1,
      provider: "mock",
      providerOrderId,
    });
    await service.markOrderPaid(order.id);
    return order;
  }

  async function activePeriodPlanIds(userId: string): Promise<string[]> {
    const [m] = await db.select().from(membership).where(eq(membership.userId, userId));
    if (!m) return [];
    const periods = await db
      .select()
      .from(membershipPeriod)
      .where(eq(membershipPeriod.membershipId, m.id));
    return periods.filter((p) => p.status === "active").map((p) => p.planId).sort();
  }

  it("scenario A: refunding the latest order removes only its period", async () => {
    await buy("a1", "monthly", "mock_a1");
    const o2 = await buy("a1", "quarterly", "mock_a2");

    await service.refundOrder(o2.id);

    expect(await activePeriodPlanIds("a1")).toEqual(["monthly"]);
  });

  it("scenario A': refunding an earlier order preserves later periods (documented gap)", async () => {
    const o1 = await buy("a2", "monthly", "mock_a2_m");
    await buy("a2", "quarterly", "mock_a2_q");

    await service.refundOrder(o1.id);

    // monthly 被撤销, quarterly 保留 (其 start_at 仍在原位置, 形成 gap)
    expect(await activePeriodPlanIds("a2")).toEqual(["quarterly"]);
  });

  it("scenario B: refunding an expired order does not reduce the active order", async () => {
    const o1 = await buy("b1", "monthly", "mock_b1");
    // 模拟第一笔已自然过期
    await db
      .update(membershipPeriod)
      .set({ endAt: new Date(Date.now() - 30 * DAY) })
      .where(eq(membershipPeriod.orderId, o1.id));

    await buy("b1", "yearly", "mock_b2");
    const [before] = await db.select().from(membership).where(eq(membership.userId, "b1"));
    const beforeEnd = new Date(before.end_date).getTime();

    await service.refundOrder(o1.id);

    const [after] = await db.select().from(membership).where(eq(membership.userId, "b1"));
    expect(new Date(after.end_date).getTime()).toBe(beforeEnd);
  });

  it("scenario C: refunding the middle order keeps other periods", async () => {
    await buy("c1", "monthly", "mock_c1");
    const o2 = await buy("c1", "quarterly", "mock_c2");
    await buy("c1", "yearly", "mock_c3");

    await service.refundOrder(o2.id);

    expect(await activePeriodPlanIds("c1")).toEqual(["monthly", "yearly"]);
  });

  it("lifetime period (durationDays=null) is permanent", async () => {
    await db.insert(user).values({ id: "l1" }).onConflictDoNothing();
    const order = await service.createOrder({
      userId: "l1",
      planId: "monthly",
      amountFen: 1,
      provider: "mock",
      providerOrderId: "mock_l1",
    });
    await service.activateForDays("l1", null, "lifetime", order.id);

    const [p] = await db.select().from(membershipPeriod).where(eq(membershipPeriod.orderId, order.id));
    expect(p.endAt).toBeNull();
    expect(await service.isMember("l1")).toBe(true);
  });

  it("backfill creates periods for historical paid orders", async () => {
    const order = await buy("bk1", "monthly", "mock_bk1");
    await db.delete(membershipPeriod).where(eq(membershipPeriod.orderId, order.id));

    await service.backfillMembershipPeriods();

    const periods = await db
      .select()
      .from(membershipPeriod)
      .where(eq(membershipPeriod.orderId, order.id));
    expect(periods).toHaveLength(1);
    expect(periods[0].planId).toBe("monthly");
  });
});
