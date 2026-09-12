import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";

import { commissionRecord, membership, partner, plans, referral, user } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { MembershipService } from "../../membership/membership.service";
import { MockPaymentProvider } from "../../payment/mock-payment.provider";
import { PAYMENT_PROVIDER } from "../../payment/payment-provider.interface";
import { PartnerService } from "../partner.service";

async function seedPlans(db: DbType) {
  await db.insert(plans).values([
    { id: "monthly", name: "月度会员", priceFen: 1800, durationDays: 30, sortOrder: 1 },
    { id: "lifetime", name: "永久会员", priceFen: 19900, durationDays: null, sortOrder: 4 },
  ]);
}

describe("PartnerService (partner / referral / commission)", () => {
  let db: DbType;
  let partnerService: PartnerService;
  let membershipService: MembershipService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [
        PartnerService,
        MembershipService,
        { provide: PAYMENT_PROVIDER, useClass: MockPaymentProvider },
      ],
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

  async function seedLifetimeMember(userId: string) {
    await db.insert(membership).values({
      userId,
      start_date: new Date(),
      end_date: null,
      isActive: true,
      status: "active",
      planId: "lifetime",
      type: "regular",
    });
  }

  it("becomes a partner with a unique referral_code and bps rate", async () => {
    await seedUser("p1");
    await seedUser("p2");

    expect(await partnerService.isActivePartner("p1")).toBe(false);

    const p = await partnerService.becomePartner("p1");
    expect(p.referralCode).toBeTruthy();
    expect(p.commissionRateBps).toBe(4000);
    expect(await partnerService.isActivePartner("p1")).toBe(true);
    expect(await partnerService.isActivePartner("p2")).toBe(false);
  });

  it("binds referral by code and rejects self-referral and duplicate", async () => {
    await seedUser("ref_partner");
    await seedUser("ref_user");
    const p = await partnerService.becomePartner("ref_partner");

    const first = await partnerService.attributeReferral(p.referralCode, "ref_user");
    expect(first.attributed).toBe(true);

    const dup = await partnerService.attributeReferral(p.referralCode, "ref_user");
    expect(dup.attributed).toBe(false);
    expect(dup.reason).toBe("already_referred");

    const self = await partnerService.attributeReferral(p.referralCode, "ref_partner");
    expect(self.attributed).toBe(false);
    expect(self.reason).toBe("self_referral");
  });

  it("suspended partner cannot be attributed", async () => {
    await seedUser("partner_susp");
    await seedUser("buyer_susp");
    const p = await partnerService.becomePartner("partner_susp");
    await partnerService.suspendPartner(p.id);

    const result = await partnerService.attributeReferral(p.referralCode, "buyer_susp");
    expect(result.attributed).toBe(false);
    expect(result.reason).toBe("partner_not_found");
  });

  it("concurrent attribution produces only one referral", async () => {
    await seedUser("partner_conc");
    await seedUser("buyer_conc");
    const p = await partnerService.becomePartner("partner_conc");

    await Promise.all([
      partnerService.attributeReferral(p.referralCode, "buyer_conc"),
      partnerService.attributeReferral(p.referralCode, "buyer_conc"),
      partnerService.attributeReferral(p.referralCode, "buyer_conc"),
    ]);

    const refs = await db.select().from(referral).where(eq(referral.referredUserId, "buyer_conc"));
    expect(refs).toHaveLength(1);
  });

  it("generates integer commission (floor) and does not duplicate", async () => {
    await seedUser("partner");
    await seedUser("buyer");
    const p = await partnerService.becomePartner("partner", 4000);
    await partnerService.attributeReferral(p.referralCode, "buyer");

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
    expect(records[0].commissionFen).toBe(Math.floor((1800 * 4000) / 10000)); // 720
    expect(records[0].rateBps).toBe(4000);
    expect(records[0].status).toBe("pending");
  });

  it("keeps historical commission rate snapshot after partner rate changes", async () => {
    await seedUser("partner");
    await seedUser("buyer");
    const p = await partnerService.becomePartner("partner", 4000);
    await partnerService.attributeReferral(p.referralCode, "buyer");

    const order = await membershipService.createOrder({
      userId: "buyer",
      planId: "monthly",
      amountFen: 1800,
      provider: "mock",
      providerOrderId: "mock_comm2",
    });
    await membershipService.markOrderPaid(order.id);

    await partnerService.becomePartner("partner", 5000);

    const [rec] = await db
      .select()
      .from(commissionRecord)
      .where(eq(commissionRecord.orderId, order.id));
    expect(rec.rateBps).toBe(4000);
    expect(rec.commissionFen).toBe(Math.floor((1800 * 4000) / 10000));
  });

  it("reverses commission on refund", async () => {
    await seedUser("partner");
    await seedUser("buyer");
    const p = await partnerService.becomePartner("partner");
    await partnerService.attributeReferral(p.referralCode, "buyer");

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

  it("rejects invalid commission rate", async () => {
    await seedUser("p_invalid");
    await expect(partnerService.becomePartner("p_invalid", -1)).rejects.toThrow();
    await expect(partnerService.becomePartner("p_invalid", 10001)).rejects.toThrow();
    await expect(partnerService.becomePartner("p_invalid", 12.5)).rejects.toThrow();
  });

  it("supports 0% and 100% commission rates (integer boundary)", async () => {
    await seedUser("p_zero");
    await seedUser("buyer_zero");
    const p0 = await partnerService.becomePartner("p_zero", 0);
    await partnerService.attributeReferral(p0.referralCode, "buyer_zero");
    const o0 = await membershipService.createOrder({
      userId: "buyer_zero",
      planId: "monthly",
      amountFen: 1800,
      provider: "mock",
      providerOrderId: "mock_rate0",
    });
    await membershipService.markOrderPaid(o0.id);
    const [c0] = await db
      .select()
      .from(commissionRecord)
      .where(eq(commissionRecord.orderId, o0.id));
    expect(c0.rateBps).toBe(0);
    expect(c0.commissionFen).toBe(0);

    await seedUser("p_full");
    await seedUser("buyer_full");
    const pFull = await partnerService.becomePartner("p_full", 10000);
    await partnerService.attributeReferral(pFull.referralCode, "buyer_full");
    const oFull = await membershipService.createOrder({
      userId: "buyer_full",
      planId: "monthly",
      amountFen: 1800,
      provider: "mock",
      providerOrderId: "mock_rate100",
    });
    await membershipService.markOrderPaid(oFull.id);
    const [cFull] = await db
      .select()
      .from(commissionRecord)
      .where(eq(commissionRecord.orderId, oFull.id));
    expect(cFull.rateBps).toBe(10000);
    expect(cFull.commissionFen).toBe(1800);
  });

  it("suspend keeps history and stops new commissions", async () => {
    await seedUser("partner_s");
    await seedUser("buyer_s");
    const p = await partnerService.becomePartner("partner_s", 4000);
    await partnerService.attributeReferral(p.referralCode, "buyer_s");

    const o1 = await membershipService.createOrder({
      userId: "buyer_s",
      planId: "monthly",
      amountFen: 1800,
      provider: "mock",
      providerOrderId: "mock_suspend1",
    });
    await membershipService.markOrderPaid(o1.id);

    await partnerService.suspendPartner(p.id);
    expect(await partnerService.isActivePartner("partner_s")).toBe(false);

    const o2 = await membershipService.createOrder({
      userId: "buyer_s",
      planId: "monthly",
      amountFen: 1800,
      provider: "mock",
      providerOrderId: "mock_suspend2",
    });
    await membershipService.markOrderPaid(o2.id);

    const records = await db
      .select()
      .from(commissionRecord)
      .where(eq(commissionRecord.partnerUserId, "partner_s"));
    expect(records).toHaveLength(1);
    expect(records[0].orderId).toBe(o1.id);

    // 历史归因保留
    const refs = await db.select().from(referral).where(eq(referral.referredUserId, "buyer_s"));
    expect(refs).toHaveLength(1);
  });

  it("masks referral identity in listReferrals", async () => {
    await db
      .insert(user)
      .values({ id: "partner_p", username: "PartnerName" })
      .onConflictDoNothing();
    await db.insert(user).values({ id: "buyer_p", username: "Alice" }).onConflictDoNothing();
    const p = await partnerService.becomePartner("partner_p");
    await partnerService.attributeReferral(p.referralCode, "buyer_p");

    const result = await partnerService.listReferrals("partner_p");
    expect(result.count).toBe(1);
    expect(result.referrals[0].username).toBe("A***");
    expect(result.referrals[0]).not.toHaveProperty("referredUserId");
    expect(result.referrals[0]).not.toHaveProperty("referrerId");
    expect(JSON.stringify(result)).not.toContain("buyer_p");
    expect(JSON.stringify(result)).not.toContain("partner_p");
  });

  it("rejects self-referral at database level", async () => {
    await db.insert(user).values({ id: "self_user" }).onConflictDoNothing();
    await expect(
      db.insert(referral).values({
        referrerId: "self_user",
        referredUserId: "self_user",
        referralCode: "any",
      }),
    ).rejects.toThrow();
  });

  describe("partner lifecycle (apply / state machine)", () => {
    it("lifetime member applies -> pending", async () => {
      await seedUser("u_life");
      await seedLifetimeMember("u_life");

      const p = await partnerService.apply("u_life");
      expect(p.status).toBe("pending");
      expect(p.referralCode).toBeTruthy();
    });

    it("non-lifetime user cannot apply", async () => {
      await seedUser("u_month");
      await db.insert(membership).values({
        userId: "u_month",
        start_date: new Date(),
        end_date: new Date(Date.now() + 86400000),
        isActive: true,
        status: "active",
        planId: "monthly",
        type: "regular",
      });

      await expect(partnerService.apply("u_month")).rejects.toThrow(BadRequestException);
    });

    it("apply is idempotent (same partner returned)", async () => {
      await seedUser("u_life2");
      await seedLifetimeMember("u_life2");

      const first = await partnerService.apply("u_life2");
      const second = await partnerService.apply("u_life2");
      expect(second.id).toBe(first.id);
    });

    it("approve -> active; suspend -> suspended; activate -> active", async () => {
      await seedUser("u_life3");
      await seedLifetimeMember("u_life3");
      const p = await partnerService.apply("u_life3");

      expect((await partnerService.approvePartner(p.id)).status).toBe("active");
      expect((await partnerService.suspendPartner(p.id)).status).toBe("suspended");
      expect((await partnerService.activatePartner(p.id)).status).toBe("active");
    });

    it("reject -> rejected; cannot activate a rejected partner", async () => {
      await seedUser("u_life4");
      await seedLifetimeMember("u_life4");
      const p = await partnerService.apply("u_life4");

      expect((await partnerService.rejectPartner(p.id)).status).toBe("rejected");
      await expect(partnerService.activatePartner(p.id)).rejects.toThrow(BadRequestException);
    });

    it("illegal transitions are rejected", async () => {
      await seedUser("u_life5");
      await seedLifetimeMember("u_life5");
      const p = await partnerService.apply("u_life5");

      // pending 不能直接 suspend/activate
      await expect(partnerService.suspendPartner(p.id)).rejects.toThrow(BadRequestException);
      await expect(partnerService.activatePartner(p.id)).rejects.toThrow(BadRequestException);
    });
  });
});
