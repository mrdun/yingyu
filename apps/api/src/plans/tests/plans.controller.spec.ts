import { Test, TestingModule } from "@nestjs/testing";

import { planEntitlements, plans } from "@earthworm/schema";
import { testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { PlansController } from "../plans.controller";
import { PlansService } from "../plans.service";

describe("PlansController (storefront 展示数据)", () => {
  let db: DbType;
  let controller: PlansController;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [PlansService],
      controllers: [PlansController],
    }).compile();
    db = module.get<DbType>(DB);
    controller = module.get<PlansController>(PlansController);
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

  it("returns public plans with entitlements from the database (frontend must not hardcode them)", async () => {
    await db.insert(plans).values([
      { id: "monthly", name: "月度会员", priceFen: 1800, durationDays: 30, sortOrder: 1 },
      {
        id: "hidden",
        name: "内部方案",
        priceFen: 1,
        durationDays: 1,
        sortOrder: 2,
        isPublic: false,
      },
    ]);
    await db.insert(planEntitlements).values([
      { planId: "monthly", entitlementKey: "course_access", entitlementValue: "all" },
      { planId: "monthly", entitlementKey: "ai_daily_quota", entitlementValue: "10" },
      { planId: "hidden", entitlementKey: "course_access", entitlementValue: "all" },
    ]);

    const result = await controller.findAll();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "monthly", priceFen: 1800, durationDays: 30 });
    expect(result[0].entitlements).toEqual([
      { key: "course_access", value: "all" },
      { key: "ai_daily_quota", value: "10" },
    ]);
  });

  it("never leaks non-public plans to the storefront", async () => {
    await db.insert(plans).values({
      id: "hidden_only",
      name: "内部方案",
      priceFen: 100,
      durationDays: 7,
      isPublic: false,
      isActive: true,
    });

    expect(await controller.findAll()).toEqual([]);
  });
});
