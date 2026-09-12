import { Test, TestingModule } from "@nestjs/testing";

import { membership } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { MembershipService } from "../../membership/membership.service";
import { PartnerService } from "../../partner/partner.service";
import { MockPaymentProvider } from "../../payment/mock-payment.provider";
import { PAYMENT_PROVIDER } from "../../payment/payment-provider.interface";
import { CourseAccessService } from "../course-access.service";

describe("CourseAccessService", () => {
  let db: DbType;
  let service: CourseAccessService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [
        CourseAccessService,
        MembershipService,
        PartnerService,
        { provide: PAYMENT_PROVIDER, useClass: MockPaymentProvider },
      ],
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

  it("draft course is neither viewable nor studyable", async () => {
    const pack = { status: "draft", accessLevel: "free", isFree: true };
    expect(service.canViewCoursePack(pack)).toBe(false);
    await expect(service.canStudyCoursePack(null, pack)).resolves.toBe(false);
  });

  it("published free course is viewable and studyable by anyone", async () => {
    const pack = { status: "published", accessLevel: "free", isFree: true };
    expect(service.canViewCoursePack(pack)).toBe(true);
    await expect(service.canStudyCoursePack(null, pack)).resolves.toBe(true);
  });

  it("published membership course is viewable but not studyable by a guest", async () => {
    const pack = { status: "published", accessLevel: "membership", isFree: false };
    expect(service.canViewCoursePack(pack)).toBe(true);
    await expect(service.canStudyCoursePack(null, pack)).resolves.toBe(false);
  });

  it("published membership course rejects a non-member", async () => {
    const pack = { status: "published", accessLevel: "membership", isFree: false };
    await expect(service.canStudyCoursePack("u1", pack)).resolves.toBe(false);
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

    const pack = { status: "published", accessLevel: "membership", isFree: false };
    await expect(service.canStudyCoursePack("m1", pack)).resolves.toBe(true);
  });

  it("falls back to is_free when access_level is null", async () => {
    const freePack = { status: "published", accessLevel: null, isFree: true };
    await expect(service.canStudyCoursePack(null, freePack)).resolves.toBe(true);

    const membershipPack = { status: "published", accessLevel: null, isFree: false };
    await expect(service.canStudyCoursePack(null, membershipPack)).resolves.toBe(false);
  });
});
