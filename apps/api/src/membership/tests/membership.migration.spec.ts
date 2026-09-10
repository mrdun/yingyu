import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";

import { membership, planEntitlements, plans } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { MembershipService } from "../membership.service";

const DAY = 24 * 60 * 60 * 1000;

async function seedPlans(db: DbType) {
  const rows = [
    { id: "monthly", name: "月度会员", priceFen: 1800, durationDays: 30, sortOrder: 1 },
    { id: "quarterly", name: "季度会员", priceFen: 4800, durationDays: 90, sortOrder: 2 },
    { id: "yearly", name: "年度会员", priceFen: 16800, durationDays: 365, sortOrder: 3 },
    { id: "lifetime", name: "永久会员", priceFen: 19900, durationDays: null, sortOrder: 4 },
  ] as const;

  for (const p of rows) {
    await db.insert(plans).values({
      id: p.id,
      name: p.name,
      priceFen: p.priceFen,
      durationDays: p.durationDays,
      sortOrder: p.sortOrder,
    });
  }
}

describe("MembershipService.migrateLegacyMemberships", () => {
  let db: DbType;
  let service: MembershipService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [MembershipService],
    }).compile();
    db = module.get<DbType>(DB);
    service = module.get<MembershipService>(MembershipService);
  });

  beforeEach(async () => {
    await cleanDB(db);
    await db.delete(planEntitlements);
    await db.delete(plans);
    await seedPlans(db);
  });

  afterAll(async () => {
    await cleanDB(db);
    await db.delete(planEntitlements);
    await db.delete(plans);
    await endDB();
  });

  it("migrates founder to lifetime with end_date=null", async () => {
    await db.insert(membership).values({
      userId: "founder-1",
      start_date: new Date(),
      end_date: new Date(),
      isActive: true,
      type: "founder",
    });

    await service.migrateLegacyMemberships();

    const rows = await db.select().from(membership).where(eq(membership.userId, "founder-1"));
    expect(rows[0].planId).toBe("lifetime");
    expect(rows[0].end_date).toBeNull();
    expect(rows[0].status).toBe("active");
  });

  it("migrates 30-day regular to monthly", async () => {
    const start = new Date("2024-01-01T00:00:00Z");
    await db.insert(membership).values({
      userId: "reg-monthly",
      start_date: start,
      end_date: new Date(start.getTime() + 30 * DAY),
      isActive: true,
      type: "regular",
    });

    await service.migrateLegacyMemberships();

    const rows = await db.select().from(membership).where(eq(membership.userId, "reg-monthly"));
    expect(rows[0].planId).toBe("monthly");
  });

  it("migrates 365-day regular to yearly", async () => {
    const start = new Date("2024-01-01T00:00:00Z");
    await db.insert(membership).values({
      userId: "reg-yearly",
      start_date: start,
      end_date: new Date(start.getTime() + 365 * DAY),
      isActive: true,
      type: "regular",
    });

    await service.migrateLegacyMemberships();

    const rows = await db.select().from(membership).where(eq(membership.userId, "reg-yearly"));
    expect(rows[0].planId).toBe("yearly");
  });

  it("migrates unknown-duration regular to legacy_regular", async () => {
    const start = new Date("2024-01-01T00:00:00Z");
    await db.insert(membership).values({
      userId: "reg-legacy",
      start_date: start,
      end_date: new Date(start.getTime() + 50 * DAY),
      isActive: true,
      type: "regular",
    });

    await service.migrateLegacyMemberships();

    const rows = await db.select().from(membership).where(eq(membership.userId, "reg-legacy"));
    expect(rows[0].planId).toBe("legacy_regular");
  });

  it("expired member (status active, end_date<now) is not a member", async () => {
    const past = new Date(Date.now() - 86400000);
    await db.insert(membership).values({
      userId: "expired-1",
      start_date: past,
      end_date: past,
      isActive: true,
      status: "active",
      type: "regular",
    });

    expect(await service.isMember("expired-1")).toBe(false);
  });

  it("permanent member (end_date=null) is always a member", async () => {
    await db.insert(membership).values({
      userId: "perm-1",
      start_date: new Date(),
      end_date: null,
      isActive: true,
      status: "active",
      type: "regular",
    });

    expect(await service.isMember("perm-1")).toBe(true);
  });
});
