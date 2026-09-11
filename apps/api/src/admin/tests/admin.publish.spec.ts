import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { and, eq } from "drizzle-orm";

import { coursePack } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { LogtoService } from "../../logto/logto.service";
import { AdminController } from "../admin.controller";
import { AdminService } from "../admin.service";

async function insertPack(
  db: DbType,
  status: string,
  extra?: Partial<typeof coursePack.$inferInsert>,
) {
  const [pack] = await db
    .insert(coursePack)
    .values({
      order: 1,
      title: "t",
      creatorId: "admin",
      status,
      source: "manual",
      accessLevel: "membership",
      shareLevel: status === "published" ? "public" : "private",
      isFree: false,
      ...extra,
    })
    .returning();
  return pack;
}

describe("AdminService course operations (state machine / CRUD / filters)", () => {
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

  describe("state machine", () => {
    it("draft -> review (submit-review)", async () => {
      const pack = await insertPack(db, "draft");
      const updated = await service.submitReview(pack.id);
      expect(updated.status).toBe("review");
    });

    it("review -> draft (reject)", async () => {
      const pack = await insertPack(db, "review");
      const updated = await service.rejectReview(pack.id);
      expect(updated.status).toBe("draft");
    });

    it("review -> published (publish)", async () => {
      const pack = await insertPack(db, "review");
      const updated = await service.publishCoursePack(pack.id);
      expect(updated.status).toBe("published");
      expect(updated.shareLevel).toBe("public");
    });

    it("published -> archived (archive)", async () => {
      const pack = await insertPack(db, "published");
      const updated = await service.archiveCoursePack(pack.id);
      expect(updated.status).toBe("archived");
    });

    it("archived -> draft (restore)", async () => {
      const pack = await insertPack(db, "archived");
      const updated = await service.restoreCoursePack(pack.id);
      expect(updated.status).toBe("draft");
    });

    it("rejects draft -> published", async () => {
      const pack = await insertPack(db, "draft");
      await expect(service.publishCoursePack(pack.id)).rejects.toThrow(BadRequestException);
    });

    it("rejects draft -> archived", async () => {
      const pack = await insertPack(db, "draft");
      await expect(service.archiveCoursePack(pack.id)).rejects.toThrow(BadRequestException);
    });

    it("rejects published -> draft", async () => {
      const pack = await insertPack(db, "published");
      await expect(service.restoreCoursePack(pack.id)).rejects.toThrow(BadRequestException);
    });

    it("rejects published -> review", async () => {
      const pack = await insertPack(db, "published");
      await expect(service.submitReview(pack.id)).rejects.toThrow(BadRequestException);
    });

    it("rejects archived -> published", async () => {
      const pack = await insertPack(db, "archived");
      await expect(service.publishCoursePack(pack.id)).rejects.toThrow(BadRequestException);
    });
  });

  describe("create / update / access level", () => {
    it("creates a course pack as draft + manual + membership by default", async () => {
      const pack = await service.createCoursePack({ title: "new" });
      expect(pack.status).toBe("draft");
      expect(pack.source).toBe("manual");
      expect(pack.accessLevel).toBe("membership");
      expect(pack.isFree).toBe(false);
      expect(pack.shareLevel).toBe("private");
    });

    it("creates a free course pack when accessLevel is free", async () => {
      const pack = await service.createCoursePack({ title: "free", accessLevel: "free" });
      expect(pack.accessLevel).toBe("free");
      expect(pack.isFree).toBe(true);
    });

    it("updates attributes without changing status", async () => {
      const pack = await insertPack(db, "published");
      const updated = await service.updateCoursePack(pack.id, {
        title: "updated",
        accessLevel: "free",
      });
      expect(updated.title).toBe("updated");
      expect(updated.accessLevel).toBe("free");
      expect(updated.isFree).toBe(true);
      expect(updated.status).toBe("published");
    });

    it("setAccessLevel flips free <-> membership and syncs is_free", async () => {
      const pack = await insertPack(db, "draft");
      const free = await service.setCoursePackAccessLevel(pack.id, "free");
      expect(free.accessLevel).toBe("free");
      expect(free.isFree).toBe(true);

      const membership = await service.setCoursePackAccessLevel(pack.id, "membership");
      expect(membership.accessLevel).toBe("membership");
      expect(membership.isFree).toBe(false);
    });
  });

  describe("list filters", () => {
    it("filters by status / source / access_level", async () => {
      await insertPack(db, "draft", { source: "ai", accessLevel: "membership" });
      await insertPack(db, "review", { source: "manual", accessLevel: "free", isFree: true });
      await insertPack(db, "published", { source: "manual", accessLevel: "membership" });

      const drafts = await service.listCoursePacks({ page: 1, pageSize: 20, status: "draft" });
      expect(drafts.total).toBe(1);
      expect(drafts.coursePacks[0].source).toBe("ai");

      const free = await service.listCoursePacks({ page: 1, pageSize: 20, accessLevel: "free" });
      expect(free.total).toBe(1);
      expect(free.coursePacks[0].status).toBe("review");
    });

    it("published + public courses are marketplace visible", async () => {
      const pack = await insertPack(db, "review");
      await service.publishCoursePack(pack.id);

      const marketplace = await db
        .select()
        .from(coursePack)
        .where(and(eq(coursePack.status, "published"), eq(coursePack.shareLevel, "public")));
      expect(marketplace).toHaveLength(1);
      expect(marketplace[0].id).toBe(pack.id);
    });
  });

  describe("permissions", () => {
    it("all admin course-pack endpoints require admin:access", () => {
      const methods = [
        "coursePacks",
        "createCoursePack",
        "updateCoursePack",
        "setAccessLevel",
        "toggleFree",
        "submitReview",
        "reject",
        "publish",
        "archive",
        "restore",
      ];
      for (const method of methods) {
        const permissions = Reflect.getMetadata(
          "permissions",
          (AdminController.prototype as any)[method],
        );
        expect(permissions).toEqual(["admin:access"]);
      }
    });
  });
});
