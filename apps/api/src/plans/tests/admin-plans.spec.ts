import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { membership, planEntitlements, plans, user } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { MembershipService } from "../../membership/membership.service";
import { PartnerService } from "../../partner/partner.service";
import { MockPaymentProvider } from "../../payment/mock-payment.provider";
import { PAYMENT_PROVIDER } from "../../payment/payment-provider.interface";
import { AdminPlansController } from "../admin-plans.controller";
import { PlansService } from "../plans.service";

describe("AdminPlansController / PlansService", () => {
  let db: DbType;
  let service: PlansService;
  let membershipService: MembershipService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [
        PlansService,
        MembershipService,
        PartnerService,
        { provide: PAYMENT_PROVIDER, useClass: MockPaymentProvider },
      ],
      controllers: [AdminPlansController],
    }).compile();
    db = module.get<DbType>(DB);
    service = module.get<PlansService>(PlansService);
    membershipService = module.get<MembershipService>(MembershipService);
  });

  beforeEach(async () => {
    await cleanDB(db);
    await db.delete(planEntitlements);
    await db.delete(plans);
    await db.delete(user);
    await db.insert(user).values({ id: "u1" }).onConflictDoNothing();
  });

  afterAll(async () => {
    await cleanDB(db);
    await db.delete(planEntitlements);
    await db.delete(plans);
    await db.delete(user);
    await endDB();
  });

  it("admin creates a plan", async () => {
    const created = await service.createPlan({
      id: "promo",
      name: "限时体验",
      priceFen: 990,
      durationDays: 7,
      sortOrder: 5,
    });
    expect(created.id).toBe("promo");
    expect(created.priceFen).toBe(990);
    expect(created.isActive).toBe(true);
    expect(created.isPublic).toBe(true);
  });

  it("rejects invalid price and duration", async () => {
    await expect(service.createPlan({ id: "bad", name: "bad", priceFen: 0 })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.createPlan({ id: "bad2", name: "bad", priceFen: -100 })).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.createPlan({ id: "bad3", name: "bad", priceFen: 100, durationDays: 0 }),
    ).rejects.toThrow(BadRequestException);
  });

  it("changes price for new orders but keeps historical order amount", async () => {
    await service.createPlan({ id: "promo", name: "promo", priceFen: 1000 });

    const order = await membershipService.createOrder({
      userId: "u1",
      planId: "promo",
      provider: "mock",
      providerOrderId: "o1",
    });
    expect(order.amountFen).toBe(1000);

    await service.updatePlan("promo", { priceFen: 2000 });

    const historical = await membershipService.findOrder(order.id);
    expect(historical.amountFen).toBe(1000); // 历史快照不变

    const order2 = await membershipService.createOrder({
      userId: "u1",
      planId: "promo",
      provider: "mock",
      providerOrderId: "o2",
    });
    expect(order2.amountFen).toBe(2000); // 新订单用新价
  });

  it("inactive plan cannot be purchased", async () => {
    await service.createPlan({ id: "off", name: "off", priceFen: 1000 });
    await service.updatePlan("off", { isActive: false });

    await expect(
      membershipService.createOrder({
        userId: "u1",
        planId: "off",
        provider: "mock",
        providerOrderId: "o3",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("public listing only returns active + public plans", async () => {
    await service.createPlan({ id: "pub", name: "pub", priceFen: 1000 });
    await service.createPlan({ id: "hidden", name: "hidden", priceFen: 1000, isPublic: false });
    await service.createPlan({ id: "off", name: "off", priceFen: 1000, isActive: false });

    const rows = await service.findPublic();
    expect(rows.map((p) => p.id)).toEqual(["pub"]);
  });

  it("does not delete a plan that already has orders", async () => {
    await service.createPlan({ id: "promo", name: "promo", priceFen: 1000 });
    await membershipService.createOrder({
      userId: "u1",
      planId: "promo",
      provider: "mock",
      providerOrderId: "o9",
    });
    await expect(service.deletePlan("promo")).rejects.toThrow(BadRequestException);
    expect(await service.findById("promo")).toBeTruthy();
  });

  it("deletes an unused plan together with its entitlements", async () => {
    await service.createPlan({ id: "unused", name: "unused", priceFen: 1000 });
    await db.insert(planEntitlements).values({
      planId: "unused",
      entitlementKey: "course_access",
      entitlementValue: "all",
    });

    await expect(service.deletePlan("unused")).resolves.toEqual({ id: "unused", deleted: true });
    expect(await service.findById("unused")).toBeFalsy();
    expect(await service.getPlanEntitlements("unused")).toHaveLength(0);
  });

  it("does not delete a plan referenced by memberships (admin grant, no order)", async () => {
    await service.createPlan({ id: "grant", name: "grant", priceFen: 1000 });
    await db.insert(membership).values({
      userId: "u1",
      planId: "grant",
      start_date: new Date(),
      end_date: null,
    });

    await expect(service.deletePlan("grant")).rejects.toThrow(BadRequestException);
    expect(await service.findById("grant")).toBeTruthy();
  });

  it("rejects invalid price/duration/sortOrder on update", async () => {
    await service.createPlan({ id: "promo", name: "promo", priceFen: 1000 });

    await expect(service.updatePlan("promo", { priceFen: 0 })).rejects.toThrow(BadRequestException);
    await expect(service.updatePlan("promo", { priceFen: 1.5 })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.updatePlan("promo", { durationDays: -1 })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.updatePlan("promo", { sortOrder: -1 })).rejects.toThrow(
      BadRequestException,
    );
    // 校验失败不得落库
    expect((await service.findById("promo"))?.priceFen).toBe(1000);
  });

  it("admin plan endpoints require admin:access", () => {
    for (const method of ["list", "create", "update", "remove"]) {
      const permissions = Reflect.getMetadata(
        "permissions",
        (AdminPlansController.prototype as any)[method],
      );
      expect(permissions).toEqual(["admin:access"]);
    }
  });
});
