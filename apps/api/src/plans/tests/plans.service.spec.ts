import { Test, TestingModule } from "@nestjs/testing";

import { planEntitlements, plans } from "@earthworm/schema";
import { testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { PlansService } from "../plans.service";

async function seedPlans(db: DbType) {
  const rows = [
    { id: "monthly", name: "月度会员", priceFen: 1800, durationDays: 30, sortOrder: 1 },
    { id: "quarterly", name: "季度会员", priceFen: 4800, durationDays: 90, sortOrder: 2 },
    { id: "yearly", name: "年度会员", priceFen: 16800, durationDays: 365, sortOrder: 3 },
    { id: "lifetime", name: "永久会员", priceFen: 19900, durationDays: null, sortOrder: 4 },
  ] as const;

  for (const plan of rows) {
    await db.insert(plans).values({
      id: plan.id,
      name: plan.name,
      priceFen: plan.priceFen,
      durationDays: plan.durationDays,
      sortOrder: plan.sortOrder,
    });
    await db.insert(planEntitlements).values({
      planId: plan.id,
      entitlementKey: "course_access",
      entitlementValue: "all",
    });
  }
}

describe("PlansService", () => {
  let db: DbType;
  let service: PlansService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [PlansService],
    }).compile();
    db = module.get<DbType>(DB);
    service = module.get<PlansService>(PlansService);
  });

  beforeEach(async () => {
    await db.delete(planEntitlements);
    await db.delete(plans);
  });

  afterAll(async () => {
    await db.delete(planEntitlements);
    await db.delete(plans);
    await endDB();
  });

  it("returns the four seeded plans with correct fields", async () => {
    await seedPlans(db);

    const rows = await service.findAll();
    expect(rows.map((p) => p.id)).toEqual(["monthly", "quarterly", "yearly", "lifetime"]);
    expect(rows[0].priceFen).toBe(1800);
    expect(rows[1].priceFen).toBe(4800);
    expect(rows[2].priceFen).toBe(16800);
    expect(rows[3].durationDays).toBeNull(); // lifetime = 永久会员
  });

  it("finds a single plan by id", async () => {
    await seedPlans(db);

    const plan = await service.findById("yearly");
    expect(plan).toBeTruthy();
    expect(plan?.name).toBe("年度会员");
    expect(plan?.durationDays).toBe(365);
  });

  it("returns correct entitlements per plan", async () => {
    await seedPlans(db);

    const entitlements = await service.getPlanEntitlements("monthly");
    expect(entitlements).toHaveLength(1);
    expect(entitlements[0].entitlementKey).toBe("course_access");
    expect(entitlements[0].entitlementValue).toBe("all");
  });
});
