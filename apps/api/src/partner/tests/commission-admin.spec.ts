import { RequestMethod } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";

import { commissionRecord, orders, plans, user } from "@earthworm/schema";
import { testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { CommissionAdminController } from "../commission-admin.controller";
import { PartnerService } from "../partner.service";

/**
 * GET /admin/commissions (本批次新增的唯一后端接口)。
 *
 * 防的回归:
 *  - 分页参数不收敛 (pageSize 无上限会把整表拉回浏览器)
 *  - 状态过滤失效 (运营按 status 排查时看到别的状态)
 *  - 列表投影扩大 (把 partners.commission_rate / 任何凭证带出去)
 *  - 漏标 @Permissions("admin:access") (无权限账号可读全站佣金)
 */
const PARTNER_ID = "commission_admin_spec_partner";
const BUYER_ID = "commission_admin_spec_buyer";
const PLAN_ID = "commission_admin_spec_plan";
const ORDER_IDS = [
  "commission_admin_spec_order_1",
  "commission_admin_spec_order_2",
  "commission_admin_spec_order_3",
];
const COMMISSION_IDS = [
  "commission_admin_spec_c1",
  "commission_admin_spec_c2",
  "commission_admin_spec_c3",
];

/** 列表允许返回的字段 (白名单: 多一个字段就说明投影被扩大) */
const ALLOWED_FIELDS = [
  "commissionFen",
  "createdAt",
  "holdUntil",
  "id",
  "orderAmountFen",
  "orderId",
  "paidAt",
  "partnerUserId",
  "partnerUsername",
  "rateBps",
  "referredUserId",
  "referredUsername",
  "status",
  "updatedAt",
];

async function cleanup(db: DbType) {
  await db.delete(commissionRecord).where(inArray(commissionRecord.id, COMMISSION_IDS));
  await db.delete(orders).where(inArray(orders.id, ORDER_IDS));
  await db.delete(plans).where(eq(plans.id, PLAN_ID));
  await db.delete(user).where(inArray(user.id, [PARTNER_ID, BUYER_ID]));
}

describe("CommissionAdminController GET /admin/commissions", () => {
  let db: DbType;
  let service: PartnerService;
  let controller: CommissionAdminController;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [PartnerService],
      controllers: [CommissionAdminController],
    }).compile();

    db = module.get<DbType>(DB);
    service = module.get<PartnerService>(PartnerService);
    controller = new CommissionAdminController(service);
  });

  beforeEach(async () => {
    await cleanup(db);
    await db
      .insert(user)
      .values([
        { id: PARTNER_ID, username: "partner_demo" },
        { id: BUYER_ID, username: "buyer_demo" },
      ])
      .onConflictDoNothing();
    await db
      .insert(plans)
      .values({ id: PLAN_ID, name: "spec plan", priceFen: 19900, durationDays: null, sortOrder: 0 })
      .onConflictDoNothing();
    await db.insert(orders).values(
      ORDER_IDS.map((id) => ({
        id,
        userId: BUYER_ID,
        planId: PLAN_ID,
        amountFen: 19900,
        status: "paid",
        provider: "mock",
      })),
    );

    // createdAt 依次递减, 保证「按创建时间倒序」的分页结果可预期
    const now = Date.now();
    await db.insert(commissionRecord).values(
      COMMISSION_IDS.map((id, index) => ({
        id,
        partnerUserId: PARTNER_ID,
        referredUserId: BUYER_ID,
        orderId: ORDER_IDS[index] as string,
        orderAmountFen: 19900,
        rate: 0.25,
        rateBps: 2500,
        commissionFen: 4975,
        status: index === 0 ? "paid" : "holding",
        holdUntil: new Date(now + 24 * 60 * 60 * 1000),
        createdAt: new Date(now - index * 1000),
      })),
    );
  });

  afterAll(async () => {
    await cleanup(db);
    await endDB();
  });

  it("paginates and keeps the newest first", async () => {
    const first = await service.listCommissions({ page: 1, pageSize: 2 });
    expect(first.total).toBe(3);
    expect(first.page).toBe(1);
    expect(first.pageSize).toBe(2);
    expect(first.items.map((row) => row.id)).toEqual([COMMISSION_IDS[0], COMMISSION_IDS[1]]);

    const second = await service.listCommissions({ page: 2, pageSize: 2 });
    expect(second.items.map((row) => row.id)).toEqual([COMMISSION_IDS[2]]);
  });

  it("filters by status (schema 枚举) and returns an empty page for unknown values", async () => {
    const holding = await service.listCommissions({ page: 1, pageSize: 20, status: "holding" });
    expect(holding.total).toBe(2);
    expect(holding.items.every((row) => row.status === "holding")).toBe(true);

    const paid = await service.listCommissions({ page: 1, pageSize: 20, status: "paid" });
    expect(paid.total).toBe(1);
    expect(paid.items[0]?.id).toBe(COMMISSION_IDS[0]);

    const unknown = await service.listCommissions({
      page: 1,
      pageSize: 20,
      status: "not_a_status",
    });
    expect(unknown.total).toBe(0);
    expect(unknown.items).toEqual([]);
  });

  it("clamps pagination to the lower/upper bounds (page >= 1, pageSize <= 100)", async () => {
    const clamped = await service.listCommissions({ page: 0, pageSize: 1000 });
    expect(clamped.page).toBe(1);
    expect(clamped.pageSize).toBe(100);

    // page="abc" → Number("abc") = NaN (falsy) → NaN || 1 = 1 → Math.max(1, 1) = 1
    // pageSize="-5" → Number("-5") = -5; 负数也是真值 (只有 NaN / 0 / "" 才 falsy),
    //   所以 -5 || 20 = -5 而不是回落到 20 → Math.max(-5, 1) = 1 → Math.min(1, 100) = 1。
    // 即负数 pageSize 走的是「夹到下限 1」, 与本仓库既有约定一致:
    //   admin/admin.controller.ts 的 GET /admin/users 与 /admin/course-packs 同样是
    //   Math.min(Math.max(Number(pageSize) || 20, 1), 100)。
    const viaController = await controller.list("abc", "-5");
    expect(viaController.page).toBe(1);
    expect(viaController.pageSize).toBe(1);

    const filteredViaController = await controller.list("1", "500", "holding");
    expect(filteredViaController.pageSize).toBe(100);
    expect(filteredViaController.total).toBe(2);
  });

  it("falls back to the default page size for non-numeric input", async () => {
    // 这才是 || 20 生效的分支: Number("abc") = NaN (falsy) → NaN || 20 = 20
    const nonNumeric = await controller.list("1", "abc");
    expect(nonNumeric.pageSize).toBe(20);

    // 空串同理: Number("") = 0 (falsy) → 0 || 20 = 20 → Math.max(20, 1) = 20
    const blank = await controller.list("1", "");
    expect(blank.pageSize).toBe(20);

    // 参数整体缺省: Number(undefined) = NaN → page = 1, pageSize = 20
    const omitted = await controller.list();
    expect(omitted.page).toBe(1);
    expect(omitted.pageSize).toBe(20);
  });

  it("projects only operational fields (no rate float, no credentials)", async () => {
    const page = await service.listCommissions({ page: 1, pageSize: 2 });
    const row = page.items[0];
    expect(row).toBeDefined();
    expect(Object.keys(row as object).sort()).toEqual(ALLOWED_FIELDS);
    expect(row?.partnerUsername).toBe("partner_demo");
    expect(row?.referredUsername).toBe("buyer_demo");

    // 旧字段 partners.commission_rate / commission_records.rate 不投影到管理端
    const serialized = JSON.stringify(page);
    expect(serialized).not.toContain('"rate":');
    expect(serialized).not.toMatch(/secret|password|token|privatekey/i);
  });

  it("is a read-only GET route guarded by admin:access", () => {
    const handler = CommissionAdminController.prototype.list;
    expect(Reflect.getMetadata("permissions", handler)).toEqual(["admin:access"]);
    expect(Reflect.getMetadata("permissions", CommissionAdminController)).toEqual(["admin:access"]);
    expect(Reflect.getMetadata("method", handler)).toBe(RequestMethod.GET);
    // @Get() 的路径: Nest 10 记作 "/", 这里对两种写法都放行
    expect(["/", ""]).toContain(Reflect.getMetadata("path", handler));
    expect(Reflect.getMetadata("path", CommissionAdminController)).toBe("admin/commissions");
  });
});
