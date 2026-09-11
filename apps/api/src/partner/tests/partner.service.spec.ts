import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";

import { commissionRecord, partner, plans, referral, user } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { MembershipService } from "../../membership/membership.service";
import { PartnerService } from "../partner.service";

async function seedPlans(db: DbType) {
  await db
    .insert(plans)
    .values({ id: "monthly", name: "月度会员", priceFen: 1800, durationDays: 30, sortOrder: 1 });
}

describe("PartnerService (partner / referral / commission)", () => {
  let db: DbType;
  let partnerService: PartnerService;
  let membershipService: MembershipService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [PartnerService, MembershipService],
    }).compile();
    db = module.get<DbType>(DB);
    partnerService = module.get<PartnerService>(PartnerService);
    membershipService = module.get<MembershipService>(MembershipService);
  });

  beforeEach(async () => {
    await cleanDB(db);
    await db.delete(commissionRecord);
    await db.delete(referral);
    await db.delete(partner);
    await db.delete(plans);
    await seedPlans(db);
  });

  afterAll(async () => {
    await cleanDB(db);
    await db.delete(commissionRecord);
    await db.delete(referral);
    await db.delete(partner);
    await db.delete(plans);
    await db.delete(user);
    await endDB();
  });

  async function seedUser(id: string) {
    await db.insert(user).values({ id }).onConflictDoNothing();
  }

  it("becomes a partner and is not a partner by default", async () => {
    await seedUser("p1");
    await seedUser("p2");

    expect(await partnerService.isActivePartner("p1")).toBe(false);

    const p = await partnerService.becomePartner("p1");
    expect(p.commissionRate).toBeCloseTo(0.4);
    expect(await partnerService.isActivePartner("p1")).toBe(true);
    expect(await partnerService.isActivePartner("p2")).toBe(false);
  });

  it("binds referral_code and rejects self-referral and duplicate", async () => {
    await seedUser("ref_partner");
    await seedUser("ref_user");
    await partnerService.becomePartner("ref_partner");

    const first = await partnerService.attributeReferral("ref_partner", "ref_user");
    expect(first.attributed).toBe(true);

    const dup = await partnerService.attributeReferral("ref_partner", "ref_user");
    expect(dup.attributed).toBe(false);
    expect(dup.reason).toBe("already_referred");

    const self = await partnerService.attributeReferral("ref_partner", "ref_partner");
    expect(self.attributed).toBe(false);
    expect(self.reason).toBe("self_referral");
  });

  it("generates commission on payment and does not duplicate", async () => {
    await seedUser("partner");
    await seedUser("buyer");
    await partnerService.becomePartner("partner");
    await partnerService.attributeReferral("partner", "buyer");

    const order = await membershipService.createOrder({
      userId: "buyer",
      planId: "monthly",
      amountFen: 1800,
      provider: "mock",
      providerOrderId: "mock_comm1",
    });
    await membershipService.markOrderPaid(order.id);
    await membershipService.markOrderPaid(order.id);

    const records = await db
      .select()
      .from(commissionRecord)
      .where(eq(commissionRecord.orderId, order.id));
    expect(records).toHaveLength(1);
    expect(records[0].commissionFen).toBe(Math.round(1800 * 0.4));
    expect(records[0].rate).toBeCloseTo(0.4);
    expect(records[0].status).toBe("pending");
  });

  it("keeps historical commission rate after partner rate changes", async () => {
    await seedUser("partner");
    await seedUser("buyer");
    await partnerService.becomePartner("partner", 0.4);
    await partnerService.attributeReferral("partner", "buyer");

    const order = await membershipService.createOrder({
      userId: "buyer",
      planId: "monthly",
      amountFen: 1800,
      provider: "mock",
      providerOrderId: "mock_comm2",
    });
    await membershipService.markOrderPaid(order.id);

    await partnerService.becomePartner("partner", 0.5);

    const [rec] = await db
      .select()
      .from(commissionRecord)
      .where(eq(commissionRecord.orderId, order.id));
    expect(rec.rate).toBeCloseTo(0.4);
    expect(rec.commissionFen).toBe(Math.round(1800 * 0.4));
  });

  it("reverses commission on refund", async () => {
    await seedUser("partner");
    await seedUser("buyer");
    await partnerService.becomePartner("partner");
    await partnerService.attributeReferral("partner", "buyer");

    const order = await membershipService.createOrder({
      userId: "buyer",
      planId: "monthly",
      amountFen: 1800,
      provider: "mock",
      providerOrderId: "mock_comm3",
    });
    await membershipService.markOrderPaid(order.id);
    await membershipService.refundOrder(order.id);

    const [rec] = await db
      .select()
      .from(commissionRecord)
      .where(eq(commissionRecord.orderId, order.id));
    expect(rec.status).toBe("reversed");
  });
});
