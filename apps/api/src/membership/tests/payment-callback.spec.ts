import { createHmac } from "node:crypto";

import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";

import { membership, plans, user } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { PartnerService } from "../../partner/partner.service";
import { PAYMENT_PROVIDER } from "../../payment/payment-provider.interface";
import { WechatPayProvider } from "../../payment/wechat-pay.provider";
import { MembershipService } from "../membership.service";
import { PaymentCallbackController } from "../payment-callback.controller";

const API_KEY = "test-api-key";

function sign(raw: string) {
  return createHmac("sha256", API_KEY).update(raw).digest("hex");
}

describe("WechatPayProvider + PaymentCallbackController", () => {
  let provider: WechatPayProvider;
  let controller: PaymentCallbackController;
  let service: MembershipService;
  let db: DbType;

  beforeAll(async () => {
    process.env.WECHAT_APP_ID = "app";
    process.env.WECHAT_MCH_ID = "mch";
    process.env.WECHAT_API_KEY = API_KEY;
    provider = new WechatPayProvider();

    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [
        MembershipService,
        PartnerService,
        { provide: PAYMENT_PROVIDER, useValue: provider },
        PaymentCallbackController,
      ],
    }).compile();
    db = module.get<DbType>(DB);
    service = module.get<MembershipService>(MembershipService);
    controller = module.get<PaymentCallbackController>(PaymentCallbackController);
  });

  beforeEach(async () => {
    await cleanDB(db);
    await db.delete(plans);
    await db.insert(plans).values({
      id: "monthly",
      name: "月度会员",
      priceFen: 1800,
      durationDays: 30,
      sortOrder: 1,
    });
    await db.insert(user).values({ id: "u1" }).onConflictDoNothing();
  });

  afterAll(async () => {
    await cleanDB(db);
    await db.delete(plans);
    await db.delete(user);
    await endDB();
  });

  it("verifies a valid HMAC signature and parses a paid callback", () => {
    const payload = {
      out_trade_no: "wechat_o1",
      total_fee: 1800,
      currency: "CNY",
      trade_state: "SUCCESS",
      transaction_id: "txn_1",
    };
    const raw = JSON.stringify(payload);
    expect(provider.verifyCallback(raw, sign(raw))).toBe(true);

    const parsed = provider.parseCallback(payload);
    expect(parsed.status).toBe("paid");
    expect(parsed.providerOrderId).toBe("wechat_o1");
    expect(parsed.amountFen).toBe(1800);
  });

  it("rejects an invalid signature", () => {
    const raw = JSON.stringify({ out_trade_no: "x" });
    expect(provider.verifyCallback(raw, "bad-signature")).toBe(false);
  });

  it("rejects callback with invalid signature", async () => {
    const order = await service.createOrder({
      userId: "u1",
      planId: "monthly",
      provider: "wechat",
      providerOrderId: "wechat_o1",
    });

    await expect(
      controller.handle(
        "wechat",
        { out_trade_no: "wechat_o1", total_fee: 1800, currency: "CNY", trade_state: "SUCCESS" },
        "bad",
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("rejects callback with wrong amount", async () => {
    const order = await service.createOrder({
      userId: "u1",
      planId: "monthly",
      provider: "wechat",
      providerOrderId: "wechat_o1",
    });
    const payload = {
      out_trade_no: "wechat_o1",
      total_fee: 999,
      currency: "CNY",
      trade_state: "SUCCESS",
    };
    const raw = JSON.stringify(payload);

    await expect(controller.handle("wechat", payload, sign(raw))).rejects.toThrow(
      BadRequestException,
    );
  });

  it("activates membership on a valid paid callback", async () => {
    const order = await service.createOrder({
      userId: "u1",
      planId: "monthly",
      provider: "wechat",
      providerOrderId: "wechat_o1",
    });
    const payload = {
      out_trade_no: "wechat_o1",
      total_fee: 1800,
      currency: "CNY",
      trade_state: "SUCCESS",
    };
    const raw = JSON.stringify(payload);

    await controller.handle("wechat", payload, sign(raw));

    expect((await service.findOrder(order.id)).status).toBe("paid");
    expect(await service.isMember("u1")).toBe(true);
    const [m] = await db.select().from(membership).where(eq(membership.userId, "u1"));
    expect(m.status).toBe("active");
  });
});
