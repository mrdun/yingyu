import { Test, TestingModule } from "@nestjs/testing";
import { and, eq } from "drizzle-orm";

import { coursePack } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { LogtoService } from "../../logto/logto.service";
import { AdminController } from "../admin.controller";
import { AdminService } from "../admin.service";

describe("AdminService publish / toggle-free", () => {
  let db: DbType;
  let service: AdminService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [
        AdminService,
        { provide: LogtoService, useValue: { logtoApi: { get: jest.fn() } } },
      ],
    }).compile();
    db = module.get<DbType>(DB);
    service = module.get<AdminService>(AdminService);
  });

  beforeEach(async () => {
    await cleanDB(db);
  });

  afterAll(async () => {
    await cleanDB(db);
    await endDB();
  });

  it("publishes a draft course pack", async () => {
    const [pack] = await db
      .insert(coursePack)
      .values({
        order: 1,
        title: "t",
        creatorId: "admin",
        status: "draft",
        source: "ai",
        accessLevel: "membership",
        shareLevel: "private",
        isFree: false,
      })
      .returning();

    await service.publishCoursePack(pack.id);

    const [updated] = await db.select().from(coursePack).where(eq(coursePack.id, pack.id));
    expect(updated.status).toBe("published");
    expect(updated.shareLevel).toBe("public");

    // 商城查询条件 = status=published 且 shareLevel=public, 发布后立即可见
    const marketplace = await db
      .select()
      .from(coursePack)
      .where(and(eq(coursePack.status, "published"), eq(coursePack.shareLevel, "public")));
    expect(marketplace.some((p) => p.id === pack.id)).toBe(true);
  });

  it("toggle-free syncs access_level", async () => {
    const [pack] = await db
      .insert(coursePack)
      .values({
        order: 1,
        title: "t",
        creatorId: "admin",
        isFree: false,
        accessLevel: "membership",
      })
      .returning();

    await service.toggleCoursePackFree(pack.id);

    const [updated] = await db.select().from(coursePack).where(eq(coursePack.id, pack.id));
    expect(updated.isFree).toBe(true);
    expect(updated.accessLevel).toBe("free");
  });

  it("admin course-pack endpoints require admin:access (no normal user entry)", () => {
    const methods = ["coursePacks", "toggleFree", "publish"];
    for (const method of methods) {
      const permissions = Reflect.getMetadata(
        "permissions",
        (AdminController.prototype as any)[method],
      );
      expect(permissions).toEqual(["admin:access"]);
    }
  });
});
