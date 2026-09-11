import { Test, TestingModule } from "@nestjs/testing";

import { membership } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { MembershipService } from "../../membership/membership.service";
import { PartnerService } from "../../partner/partner.service";
import { CourseAccessService } from "../course-access.service";

describe("CourseAccessService", () => {
  let db: DbType;
  let service: CourseAccessService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [CourseAccessService, MembershipService, PartnerService],
    }).compile();
    db = module.get<DbType>(DB);
    service = module.get<CourseAccessService>(CourseAccessService);
  });

  beforeEach(async () => {
    await cleanDB(db);
  });

  afterAll(async () => {
    await cleanDB(db);
    await endDB();
  });

  it("draft course is not accessible", async () => {
    const ok = await service.canAccess(null, { status: "draft", accessLevel: "free", isFree: true });
    expect(ok).toBe(false);
  });

  it("published free course is accessible to anyone", async () => {
    const ok = await service.canAccess(null, {
      status: "published",
      accessLevel: "free",
      isFree: true,
    });
    expect(ok).toBe(true);
  });

  it("published membership course rejects a non-member", async () => {
    const ok = await service.canAccess("u1", {
      status: "published",
      accessLevel: "membership",
      isFree: false,
    });
    expect(ok).toBe(false);
  });

  it("published membership course allows an active member", async () => {
    const now = new Date();
    await db.insert(membership).values({
      userId: "m1",
      start_date: now,
      end_date: new Date(now.getTime() + 86400000),
      isActive: true,
      status: "active",
      type: "regular",
    });

    const ok = await service.canAccess("m1", {
      status: "published",
      accessLevel: "membership",
      isFree: false,
    });
    expect(ok).toBe(true);
  });

  it("falls back to is_free when access_level is null", async () => {
    const ok = await service.canAccess(null, {
      status: "published",
      accessLevel: null,
      isFree: true,
    });
    expect(ok).toBe(true);
  });
});
