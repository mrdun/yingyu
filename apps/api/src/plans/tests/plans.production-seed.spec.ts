import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Test, TestingModule } from "@nestjs/testing";
import { sql } from "drizzle-orm";

import { partnerCommissionRule, planEntitlements, plans } from "@earthworm/schema";
import { testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { PlansService } from "../plans.service";

const MIGRATION_FILE = "0030_plan_production_seed.sql";

/** 定位 migration 文件 (支持从 apps/api 或仓库根目录运行) */
function resolveMigrationPath(): string {
  const candidates = [
    resolve(__dirname, `../../../../../packages/db/drizzle/${MIGRATION_FILE}`),
    resolve(process.cwd(), `../../packages/db/drizzle/${MIGRATION_FILE}`),
    resolve(process.cwd(), `packages/db/drizzle/${MIGRATION_FILE}`),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`migration not found: ${candidates.join(", ")}`);
  return found;
}

function migrationStatements(): string[] {
  return readFileSync(resolveMigrationPath(), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith("-- Custom SQL"));
}

async function runSeed(db: DbType) {
  for (const statement of migrationStatements()) {
    await db.execute(sql.raw(statement));
  }
}

describe("plans production seed migration (TASK-002-I-05)", () => {
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
    await db.delete(partnerCommissionRule);
    await db.delete(plans);
  });

  afterAll(async () => {
    await db.delete(planEntitlements);
    await db.delete(partnerCommissionRule);
    await db.delete(plans);
    await endDB();
  });

  it("seeds monthly/quarterly/yearly/lifetime plans with entitlements and a default rule", async () => {
    expect(await service.findAll()).toHaveLength(0);

    await runSeed(db);

    const rows = await service.findAll();
    expect(rows.map((p) => p.id)).toEqual(["monthly", "quarterly", "yearly", "lifetime"]);
    expect(rows.map((p) => p.priceFen)).toEqual([1800, 4800, 16800, 19900]);
    expect(rows.find((p) => p.id === "lifetime")?.durationDays).toBeNull();
    expect(rows.every((p) => p.isActive && p.isPublic)).toBe(true);

    for (const plan of rows) {
      const entitlements = await service.getPlanEntitlements(plan.id);
      expect(entitlements).toHaveLength(1);
      expect(entitlements[0].entitlementKey).toBe("course_access");
      expect(entitlements[0].entitlementValue).toBe("all");
    }

    const rules = await db.select().from(partnerCommissionRule);
    expect(rules).toHaveLength(1);
    expect(rules[0].partnerType).toBe("lifetime");
    expect(rules[0].planId).toBeNull();
    expect(rules[0].rateBps).toBe(4000);
    expect(rules[0].status).toBe("active");

    // 迁移可重复执行 (幂等)
    await runSeed(db);
    expect(await service.findAll()).toHaveLength(4);
    expect(await db.select().from(partnerCommissionRule)).toHaveLength(1);
  });

  it("does not overwrite operator-configured price or commission rules", async () => {
    await service.createPlan({ id: "monthly", name: "运营改价", priceFen: 2500 });
    await db.insert(partnerCommissionRule).values({
      id: "operator_rule",
      partnerType: "lifetime",
      planId: null,
      rateBps: 3000,
      status: "active",
    });

    await runSeed(db);

    expect((await service.findById("monthly"))?.priceFen).toBe(2500);
    const rules = await db.select().from(partnerCommissionRule);
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe("operator_rule");
    expect(rules[0].rateBps).toBe(3000);
  });

  it("reports a clear warning when plans are empty (no silent production run)", async () => {
    const emptyHealth = await service.getHealth();
    expect(emptyHealth.ok).toBe(false);
    expect(emptyHealth.plansTotal).toBe(0);
    expect(emptyHealth.warnings[0]).toContain("会员计划为空");

    await runSeed(db);

    const seededHealth = await service.getHealth();
    expect(seededHealth.ok).toBe(true);
    expect(seededHealth.plansTotal).toBe(4);
    expect(seededHealth.purchasablePlans).toBe(4);
    expect(seededHealth.warnings).toEqual([]);
  });

  it("warns when no plan is purchasable (all inactive or hidden)", async () => {
    await service.createPlan({ id: "monthly", name: "月度会员", priceFen: 1800 });
    await service.updatePlan("monthly", { isActive: false });

    const health = await service.getHealth();
    expect(health.ok).toBe(false);
    expect(health.plansTotal).toBe(1);
    expect(health.purchasablePlans).toBe(0);
    expect(health.warnings[0]).toContain("没有可售会员计划");
  });
});
