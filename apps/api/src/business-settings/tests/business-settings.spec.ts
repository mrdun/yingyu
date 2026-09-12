import { Test, TestingModule } from "@nestjs/testing";

import { businessSettings } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { BusinessSettingsController } from "../business-settings.controller";
import { BusinessSettingsService, DEFAULT_REFUND_WINDOW_HOURS } from "../business-settings.service";

describe("BusinessSettingsService", () => {
  let db: DbType;
  let service: BusinessSettingsService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [BusinessSettingsService],
      controllers: [BusinessSettingsController],
    }).compile();
    db = module.get<DbType>(DB);
    service = module.get<BusinessSettingsService>(BusinessSettingsService);
  });

  beforeEach(async () => {
    await db.delete(businessSettings);
  });

  afterAll(async () => {
    await cleanDB(db);
    await db.delete(businessSettings);
    await endDB();
  });

  it("returns the fallback when a key is missing", async () => {
    expect(await service.getRefundWindowHours()).toBe(DEFAULT_REFUND_WINDOW_HOURS);
    expect(await service.getNumber("missing_key", 7)).toBe(7);
  });

  it("sets and reads a value (upsert)", async () => {
    await service.set("refund_window_hours", "48");
    expect(await service.getRefundWindowHours()).toBe(48);

    await service.set("refund_window_hours", "12");
    expect(await service.getRefundWindowHours()).toBe(12);
  });

  it("falls back when the stored value is not a number", async () => {
    await service.set("refund_window_hours", "abc");
    expect(await service.getRefundWindowHours()).toBe(DEFAULT_REFUND_WINDOW_HOURS);
  });

  it("lists all settings", async () => {
    await service.set("refund_window_hours", "24");
    const all = await service.getAll();
    expect(all.some((s) => s.key === "refund_window_hours")).toBe(true);
  });

  it("admin settings endpoints require admin:access", () => {
    for (const method of ["list", "update"]) {
      const permissions = Reflect.getMetadata(
        "permissions",
        (BusinessSettingsController.prototype as any)[method],
      );
      expect(permissions).toEqual(["admin:access"]);
    }
  });
});
