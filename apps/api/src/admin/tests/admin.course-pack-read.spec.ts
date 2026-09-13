import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { course, coursePack, statement } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { LogtoService } from "../../logto/logto.service";
import { AdminController } from "../admin.controller";
import { AdminService } from "../admin.service";

/**
 * 管理端课程中心的两个只读读接口 (O-03 批次增量):
 *   GET /admin/course-packs/:id            单个课程包详情 (不限状态)
 *   GET /admin/courses/:courseId/statements 某课程的语句列表 (分页 + order 升序)
 *
 * 这两个接口存在的唯一理由: 公开接口对 membership 包抛 ForbiddenException 且只暴露
 * published 内容, 管理端既读不到草稿包, 也没有任何语句列表方法 —— 课程中心没法工作。
 */

async function insertPack(
  db: DbType,
  status: string,
  extra?: Partial<typeof coursePack.$inferInsert>,
) {
  const [pack] = await db
    .insert(coursePack)
    .values({
      order: 1,
      title: "pack",
      description: "desc",
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

async function insertCourseEntity(db: DbType, coursePackId: string, order = 0, title = "lesson") {
  const [c] = await db
    .insert(course)
    .values({ title, description: `${title}-desc`, coursePackId, order })
    .returning();
  return c;
}

async function insertStatementEntity(db: DbType, courseId: string, order: number, text = "hi") {
  const [s] = await db
    .insert(statement)
    .values({
      courseId,
      order,
      chinese: `中-${order}`,
      english: `${text}-${order}`,
      soundmark: `/s/${order}/`,
      sourceType: "text",
    })
    .returning();
  return s;
}

describe("AdminService course center read endpoints (O-03)", () => {
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

  describe("GET /admin/course-packs/:id (课程包详情)", () => {
    it("草稿包 (source=ai) 也能读到 —— 管理端必须能编辑自己的草稿", async () => {
      const pack = await insertPack(db, "draft", { source: "ai", accessLevel: "membership" });

      const detail = await service.getCoursePackDetail(pack.id);

      expect(detail.id).toBe(pack.id);
      expect(detail.status).toBe("draft");
      expect(detail.source).toBe("ai");
      expect(detail.accessLevel).toBe("membership");
      expect(detail.isFree).toBe(false);
      expect(detail.courses).toEqual([]);
    });

    it.each(["draft", "review", "archived"])("不限状态: %s 包可读", async (status) => {
      const pack = await insertPack(db, status);
      const detail = await service.getCoursePackDetail(pack.id);
      expect(detail.status).toBe(status);
    });

    it("不存在 → 404 NotFoundException", async () => {
      await expect(service.getCoursePackDetail("not-exist")).rejects.toBeInstanceOf(
        NotFoundException,
      );

      const error = await service.getCoursePackDetail("not-exist").catch((e: unknown) => e);
      expect((error as NotFoundException).getStatus()).toBe(404);
    });

    it("courses 按 order 升序, 且每课带 statementCount", async () => {
      const pack = await insertPack(db, "draft");
      const second = await insertCourseEntity(db, pack.id, 2, "lesson-2");
      const first = await insertCourseEntity(db, pack.id, 0, "lesson-0");
      await insertStatementEntity(db, first.id, 0);
      await insertStatementEntity(db, first.id, 1);
      // second 没有语句: 必须返回 0 而不是 null

      const detail = await service.getCoursePackDetail(pack.id);

      expect(detail.courses.map((c) => c.id)).toEqual([first.id, second.id]);
      expect(detail.courses.map((c) => c.order)).toEqual([0, 2]);
      expect(detail.courses.find((c) => c.id === first.id)?.statementCount).toBe(2);
      expect(detail.courses.find((c) => c.id === second.id)?.statementCount).toBe(0);
    });

    it("只返回课程元数据, 不在这一层返回语句正文 (响应体不能被子表撑爆)", async () => {
      const pack = await insertPack(db, "draft");
      const c = await insertCourseEntity(db, pack.id, 0);
      await insertStatementEntity(db, c.id, 0);

      const detail = await service.getCoursePackDetail(pack.id);

      expect(detail.courses[0]).not.toHaveProperty("statements");
      expect(JSON.stringify(detail)).not.toContain("中-0");
    });
  });

  describe("GET /admin/course-packs (课程包列表分页)", () => {
    it("order 全相同 (新建包默认 order=0) 时翻页不重复不遗漏", async () => {
      const created: string[] = [];
      for (let i = 0; i < 6; i++) {
        // 与 createCoursePack / AI 建课一致: 每个新包都是 order=0
        const pack = await insertPack(db, "draft", { order: 0, title: `pack-${i}` });
        created.push(pack.id);
      }

      const seen: string[] = [];
      for (let page = 1; page <= 3; page++) {
        const result = await service.listCoursePacks({ page, pageSize: 2 });
        expect(result.total).toBe(6);
        expect(result.coursePacks).toHaveLength(2);
        seen.push(...result.coursePacks.map((p) => p.id));
      }

      // 不重复: 3 页 6 行去重后仍是 6 个不同 id
      expect(new Set(seen).size).toBe(6);
      // 不遗漏: 覆盖全部 6 个包
      expect([...seen].sort()).toEqual([...created].sort());

      // 同一页重复请求结果一致 (顺序确定, 不受 limit/offset 影响)
      const firstAgain = await service.listCoursePacks({ page: 1, pageSize: 2 });
      expect(firstAgain.coursePacks.map((p) => p.id)).toEqual(seen.slice(0, 2));
    });

    it("order 不同时仍以 order 为主键排序 (次键 id 不会顶掉业务排序)", async () => {
      const third = await insertPack(db, "draft", { order: 2, title: "c" });
      const first = await insertPack(db, "draft", { order: 0, title: "a" });
      const second = await insertPack(db, "draft", { order: 1, title: "b" });

      const page1 = await service.listCoursePacks({ page: 1, pageSize: 2 });
      const page2 = await service.listCoursePacks({ page: 2, pageSize: 2 });

      expect(page1.coursePacks.map((p) => p.id)).toEqual([first.id, second.id]);
      expect(page2.coursePacks.map((p) => p.id)).toEqual([third.id]);
    });
  });

  describe("GET /admin/courses/:courseId/statements (语句列表)", () => {
    it("按 order 升序返回, 字段齐全", async () => {
      const pack = await insertPack(db, "draft");
      const c = await insertCourseEntity(db, pack.id, 0);
      const last = await insertStatementEntity(db, c.id, 7, "seven");
      const first = await insertStatementEntity(db, c.id, 1, "one");

      const result = await service.listCourseStatements(c.id, { page: 1, pageSize: 20 });

      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.items.map((s) => s.id)).toEqual([first.id, last.id]);
      expect(result.items[0]).toEqual({
        id: first.id,
        chinese: "中-1",
        english: "one-1",
        soundmark: "/s/1/",
        sourceType: "text",
        audioUrl: null,
        startMs: null,
        endMs: null,
        order: 1,
      });
    });

    it("分页: page/pageSize 生效, total 为全量条数 (不是当前页条数)", async () => {
      const pack = await insertPack(db, "draft");
      const c = await insertCourseEntity(db, pack.id, 0);
      for (let i = 0; i < 5; i++) {
        await insertStatementEntity(db, c.id, i);
      }

      const page1 = await service.listCourseStatements(c.id, { page: 1, pageSize: 2 });
      const page3 = await service.listCourseStatements(c.id, { page: 3, pageSize: 2 });

      expect(page1.total).toBe(5);
      expect(page1.items.map((s) => s.order)).toEqual([0, 1]);
      expect(page3.items.map((s) => s.order)).toEqual([4]);
    });

    it("只返回该课程的语句 (不串课)", async () => {
      const pack = await insertPack(db, "draft");
      const a = await insertCourseEntity(db, pack.id, 0, "a");
      const b = await insertCourseEntity(db, pack.id, 1, "b");
      await insertStatementEntity(db, a.id, 0);
      await insertStatementEntity(db, b.id, 0);

      const result = await service.listCourseStatements(a.id, { page: 1, pageSize: 20 });

      expect(result.total).toBe(1);
      expect(result.items[0]?.english).toBe("hi-0");
    });

    it("课程不存在 → 404 NotFoundException (不返回空列表冒充成功)", async () => {
      await expect(
        service.listCourseStatements("not-exist", { page: 1, pageSize: 20 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("permissions", () => {
    it("两个新读接口都要求 admin:access", () => {
      for (const method of ["coursePackDetail", "courseStatements"]) {
        const permissions = Reflect.getMetadata(
          "permissions",
          (AdminController.prototype as any)[method],
        );
        expect(permissions).toEqual(["admin:access"]);
      }
    });
  });
});
