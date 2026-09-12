import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";

import {
  commissionRecord,
  partner,
  partnerCommissionRule,
  plans,
  referral,
  user,
} from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { MembershipService } from "../../membership/membership.service";
import { MockPaymentProvider } from "../../payment/mock-payment.provider";
import { PAYMENT_PROVIDER } from "../../payment/payment-provider.interface";
import { PartnerController } from "../partner.controller";
import { PartnerService } from "../partner.service";

/** 1 分钟前的生效时间, 保证测试里新建规则严格更新, 选择结果确定 */
function oneMinuteAgo() {
  return new Date(Date.now() - 60_000);
}

describe("GET /partner/me (佣金唯一来源 = partner_commission_rules)", () => {
  let db: DbType;
  let controller: PartnerController;
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
      controllers: [PartnerController],
    }).compile();

    db = module.get<DbType>(DB);
    controller = module.get<PartnerController>(PartnerController);
    partnerService = module.get<PartnerService>(PartnerService);
    membershipService = module.get<MembershipService>(MembershipService);
  });

  beforeEach(async () => {
    await cleanDB(db);
    await db.delete(commissionRecord);
    await db.delete(referral);
    await db.delete(partner);
    await db.delete(partnerCommissionRule);
    await db.delete(plans);

    await db
      .insert(user)
      .values([{ id: "partner-user" }, { id: "buyer" }])
      .onConflictDoNothing();
    await db.insert(plans).values([
      { id: "monthly", name: "月度会员", priceFen: 1800, durationDays: 30, sortOrder: 1 },
      { id: "yearly", name: "年度会员", priceFen: 16800, durationDays: 365, sortOrder: 3 },
    ]);
    // 默认全局规则 40%
    await db.insert(partnerCommissionRule).values({
      id: "rule_default_40",
      partnerType: "lifetime",
      planId: null,
      rateBps: 4000,
      status: "active",
      effectiveFrom: oneMinuteAgo(),
    });
  });

  afterAll(async () => {
    await cleanDB(db);
    await db.delete(commissionRecord);
    await db.delete(referral);
    await db.delete(partner);
    await db.delete(partnerCommissionRule);
    await db.delete(plans);
    await db.delete(user);
    await endDB();
  });

  it("returns the effective rule from partner_commission_rules (not the legacy partner field)", async () => {
    await partnerService.becomePartner("partner-user", 9999);

    const me = await controller.me({ userId: "partner-user" });

    expect(me.isPartner).toBe(true);
    expect(me.status).toBe("active");
    expect(me.commission.rateBps).toBe(4000);
    expect(me.commission.percentage).toBe("40%");
    expect(me.commission.plans).toEqual([]);
    // 不得再返回 partners.commission_rate / commission_rate_bps
    expect("commissionRateBps" in me).toBe(false);
    expect("commissionRate" in me).toBe(false);
  });

  it("reflects commission rule changes immediately", async () => {
    await partnerService.becomePartner("partner-user", 4000);
    expect((await controller.me({ userId: "partner-user" })).commission.percentage).toBe("40%");

    await partnerService.createCommissionRule({
      partnerType: "lifetime",
      planId: null,
      rateBps: 3000,
      effectiveFrom: new Date(),
    });

    const me = await controller.me({ userId: "partner-user" });
    expect(me.commission.rateBps).toBe(3000);
    expect(me.commission.percentage).toBe("30%");

    // 展示比例必须等于实际计算使用的规则
    const effective = await partnerService.findActiveCommissionRule("lifetime", "monthly");
    expect(effective?.rateBps).toBe(me.commission.rateBps);
  });

  it("exposes plan-level rules while keeping the global rule as headline", async () => {
    await partnerService.becomePartner("partner-user", 4000);
    await partnerService.createCommissionRule({
      partnerType: "lifetime",
      planId: "monthly",
      rateBps: 2000,
      effectiveFrom: new Date(),
    });

    const me = await controller.me({ userId: "partner-user" });

    expect(me.commission.rateBps).toBe(4000); // 全局默认
    expect(me.commission.plans).toEqual([{ planId: "monthly", rateBps: 2000, percentage: "20%" }]);
    expect((await partnerService.findActiveCommissionRule("lifetime", "monthly"))?.rateBps).toBe(
      2000,
    );
    expect((await partnerService.findActiveCommissionRule("lifetime", "yearly"))?.rateBps).toBe(
      4000,
    );
  });

  it("formats non-integer percentages (3750 bps -> 37.5%)", async () => {
    await partnerService.createCommissionRule({
      partnerType: "lifetime",
      planId: null,
      rateBps: 3750,
      effectiveFrom: new Date(),
    });

    const me = await controller.me({ userId: "partner-user" });
    expect(me.commission.rateBps).toBe(3750);
    expect(me.commission.percentage).toBe("37.5%");
  });

  it("returns no commission when there is no active rule (safe fail, no default 40%)", async () => {
    await db.delete(partnerCommissionRule);

    const me = await controller.me({ userId: "partner-user" });
    expect(me.commission.rateBps).toBeNull();
    expect(me.commission.percentage).toBeNull();
    expect(me.commission.plans).toEqual([]);
  });

  it("legacy partners.commission_rate_bps never influences displayed or recorded commission", async () => {
    const p = await partnerService.becomePartner("partner-user", 9999);
    expect(p.commissionRateBps).toBe(9999); // 旧字段仍写入 (兼容), 但不再被读取

    await partnerService.attributeReferral(p.referralCode, "buyer");

    const me = await controller.me({ userId: "partner-user" });
    expect(me.commission.rateBps).toBe(4000);

    const order = await membershipService.createOrder({
      userId: "buyer",
      planId: "monthly",
      provider: "mock",
      providerOrderId: "mock_partner_me",
    });
    await membershipService.markOrderPaid(order.id);

    const [record] = await db
      .select()
      .from(commissionRecord)
      .where(eq(commissionRecord.orderId, order.id));
    expect(record.rateBps).toBe(4000); // 规则快照, 不是 9999
    expect(record.commissionFen).toBe(Math.floor((1800 * 4000) / 10000));
  });
});
