import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";

import { course, coursePack, statement, userStatementProgress } from "@earthworm/schema";
import { insertStatement } from "../../../test/fixture/db";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { LogtoService } from "../../logto/logto.service";
import { AdminController } from "../admin.controller";
import { AdminService } from "../admin.service";

async function insertPack(db: DbType, status: string) {
  const [pack] = await db
    .insert(coursePack)
    .values({
      order: 1,
      title: "pack",
      creatorId: "admin",
      status,
      source: "manual",
      accessLevel: "membership",
      shareLevel: status === "published" ? "public" : "private",
      isFree: false,
    })
    .returning();
  return pack;
}

async function insertCourseEntity(db: DbType, coursePackId: string, order = 0) {
  const [c] = await db.insert(course).values({ title: "lesson", coursePackId, order }).returning();
  return c;
}

describe("AdminService course content (course / statement CRUD)", () => {
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

  describe("course CRUD", () => {
    it("creates a course under a draft pack with auto order", async () => {
      const pack = await insertPack(db, "draft");
      const created = await service.createCourse(pack.id, { title: "lesson 1" });

      expect(created.coursePackId).toBe(pack.id);
      expect(created.order).toBe(0);
    });

    it("updates a course title and order", async () => {
      const pack = await insertPack(db, "draft");
      const c = await insertCourseEntity(db, pack.id);

      const updated = await service.updateCourse(c.id, { title: "renamed", order: 5 });
      expect(updated.title).toBe("renamed");
      expect(updated.order).toBe(5);
    });

    it("deletes a course with its statements (draft)", async () => {
      const pack = await insertPack(db, "draft");
      const c = await insertCourseEntity(db, pack.id);
      await db.insert(statement).values({
        courseId: c.id,
        order: 0,
        chinese: "你好",
        english: "hello",
        soundmark: "",
      });

      const result = await service.deleteCourse(c.id);
      expect(result.deleted).toBe(true);
      expect(await db.query.course.findFirst({ where: eq(course.id, c.id) })).toBeUndefined();
      expect(
        await db.query.statement.findFirst({ where: eq(statement.courseId, c.id) }),
      ).toBeUndefined();
    });

    it("rejects deleting a published course", async () => {
      const pack = await insertPack(db, "published");
      const c = await insertCourseEntity(db, pack.id);
      await expect(service.deleteCourse(c.id)).rejects.toThrow(BadRequestException);
    });
  });

  describe("statement CRUD", () => {
    it("creates a statement under a course with auto order", async () => {
      const pack = await insertPack(db, "draft");
      const c = await insertCourseEntity(db, pack.id);
      const s = await service.createStatement(c.id, { chinese: "你好", english: "hello" });

      expect(s.courseId).toBe(c.id);
      expect(s.order).toBe(0);
      expect(s.sourceType).toBe("text");
    });

    it("updates statement content and order", async () => {
      const pack = await insertPack(db, "draft");
      const c = await insertCourseEntity(db, pack.id);
      const s = await service.createStatement(c.id, { chinese: "你好", english: "hello" });

      const updated = await service.updateStatement(s.id, { chinese: "再见", order: 3 });
      expect(updated.chinese).toBe("再见");
      expect(updated.order).toBe(3);
    });

    it("deletes a statement (draft)", async () => {
      const pack = await insertPack(db, "draft");
      const c = await insertCourseEntity(db, pack.id);
      const s = await service.createStatement(c.id, { chinese: "你好", english: "hello" });

      const result = await service.deleteStatement(s.id);
      expect(result.deleted).toBe(true);
      expect(await db.query.statement.findFirst({ where: eq(statement.id, s.id) })).toBeUndefined();
    });
  });

  describe("delete safety (statement progress cleanup)", () => {
    it("deleting a statement removes its user_statement_progress (no orphan)", async () => {
      const pack = await insertPack(db, "draft");
      const c = await insertCourseEntity(db, pack.id);
      const s = await insertStatement(db, c.id, 0);
      await db
        .insert(userStatementProgress)
        .values({ userId: "u1", statementId: s.id })
        .returning();

      await service.deleteStatement(s.id);

      expect(
        await db.query.userStatementProgress.findFirst({
          where: eq(userStatementProgress.statementId, s.id),
        }),
      ).toBeUndefined();
    });

    it("deleting a course removes all its statements' progress (no orphan)", async () => {
      const pack = await insertPack(db, "draft");
      const c = await insertCourseEntity(db, pack.id);
      const s = await insertStatement(db, c.id, 0);
      await db
        .insert(userStatementProgress)
        .values({ userId: "u1", statementId: s.id })
        .returning();

      await service.deleteCourse(c.id);

      expect(
        await db.query.userStatementProgress.findFirst({
          where: eq(userStatementProgress.statementId, s.id),
        }),
      ).toBeUndefined();
    });
  });

  describe("content edit status rules", () => {
    it("editing a review pack's content reverts it to draft", async () => {
      const pack = await insertPack(db, "review");
      const c = await insertCourseEntity(db, pack.id);
      await service.updateCourse(c.id, { title: "changed" });

      const [updated] = await db.select().from(coursePack).where(eq(coursePack.id, pack.id));
      expect(updated.status).toBe("draft");
    });

    it("editing a published pack's content reverts it to draft and private", async () => {
      const pack = await insertPack(db, "published");
      const c = await insertCourseEntity(db, pack.id);
      await service.createStatement(c.id, { chinese: "你好", english: "hello" });

      const [updated] = await db.select().from(coursePack).where(eq(coursePack.id, pack.id));
      expect(updated.status).toBe("draft");
      expect(updated.shareLevel).toBe("private");
    });

    it("rejects editing an archived pack's content", async () => {
      const pack = await insertPack(db, "archived");
      const c = await insertCourseEntity(db, pack.id);
      await expect(service.updateCourse(c.id, { title: "x" })).rejects.toThrow(BadRequestException);
    });
  });

  describe("permissions", () => {
    it("all course/statement admin endpoints require admin:access", () => {
      const methods = [
        "createCourse",
        "updateCourse",
        "deleteCourse",
        "createStatement",
        "updateStatement",
        "deleteStatement",
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
