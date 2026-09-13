import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";

import { coursePack } from "@earthworm/schema";
import { DB, DbType } from "../../global/providers/db.provider";
import { LogtoService } from "../../logto/logto.service";
import { AdminController } from "../admin.controller";
import { AdminService } from "../admin.service";

const TODAY = new Date("2026-08-29T12:00:00.000Z");

/**
 * 断言语义: 某个 SQL 表达式 (排序键 / 过滤条件) 是否**引用了**目标列。
 *
 * drizzle 的 asc()/desc()/eq()/and() 返回的都是**新建的 SQL 包装对象**, 不是传进去的列对象本身
 * (所以 asc(coursePack.id) !== coursePack.id)。拿返回值跟列做引用相等 (toBe) 测的是
 * "两个对象是不是同一个", 而不是"这个表达式用的是哪一列", 因此永远失败。
 * 这里顺着 SQL 的结构 (queryChunks 数组, 以及 Param 这类 value 包装) 递归找列对象本身:
 * 引用了 coursePack.id 就命中; 引用的是别的列 (coursePack.order) 或常量则不会命中。
 *
 * 只沿 SQL 结构下钻, 不遍历任意属性: Column 上有 table / columns 之类的回指,
 * 泛化遍历会从 coursePack.order 绕回 coursePack.id, 反而失去区分能力。
 */
function referencesColumn(expr: unknown, column: unknown, depth = 0): boolean {
  if (expr === column) return true;
  if (expr === null || typeof expr !== "object" || depth > 8) return false;
  if (Array.isArray(expr)) {
    return expr.some((chunk) => referencesColumn(chunk, column, depth + 1));
  }
  const node = expr as { queryChunks?: unknown; value?: unknown };
  const chunks = node.queryChunks;
  if (Array.isArray(chunks)) {
    return chunks.some((chunk) => referencesColumn(chunk, column, depth + 1));
  }
  if ("value" in node) return referencesColumn(node.value, column, depth + 1);
  return false;
}

describe("AdminController guards/decorators", () => {
  it("declares the admin controller with admin:access permission on all routes", () => {
    const permissionsMeta = Reflect.getMetadata("permissions", AdminController.prototype.overview);
    expect(permissionsMeta).toEqual(["admin:access"]);
    expect(Reflect.getMetadata("permissions", AdminController.prototype.users)).toEqual([
      "admin:access",
    ]);
    expect(Reflect.getMetadata("permissions", AdminController.prototype.coursePacks)).toEqual([
      "admin:access",
    ]);
    expect(Reflect.getMetadata("permissions", AdminController.prototype.toggleFree)).toEqual([
      "admin:access",
    ]);
    const guards = Reflect.getMetadata("__guards__", AdminController);
    expect(guards).toBeDefined();
  });
});

describe("AdminService", () => {
  let service: AdminService;
  let logtoApi: { get: jest.Mock };

  function makeDb(responses: unknown[][]) {
    // 每个查询在 await 时依次消费 responses 中的一个结果数组; 链式方法统一返回 db
    const db: Record<string, any> = {};
    const methods = [
      "select",
      "from",
      "where",
      "leftJoin",
      "groupBy",
      "orderBy",
      "limit",
      "offset",
    ];
    for (const m of methods) {
      db[m] = jest.fn().mockReturnValue(db);
    }
    (db as any).then = (resolve: (v: unknown) => void) => {
      resolve(responses.length > 0 ? responses.shift() : []);
      return Promise.resolve();
    };
    return db as unknown as DbType;
  }

  beforeEach(async () => {
    logtoApi = { get: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: DB, useValue: {} as DbType },
        { provide: LogtoService, useValue: { logtoApi } as unknown as LogtoService },
      ],
    }).compile();
    service = moduleRef.get(AdminService);
  });

  describe("overview 计算", () => {
    it("aggregates overview counters with mocked db", async () => {
      // 真实响应形状: 数组 + total-number 响应头
      logtoApi.get.mockResolvedValue({
        data: [{ id: "u1", username: "alice", createdAt: "2026-01-01T00:00:00Z" }],
        headers: { "total-number": "12" },
      });
      const db = makeDb([
        [{ total: "3" }], // activeToday
        [{ total: "5" }], // coursePackCount
        [{ total: "700" }], // statementCount
        [{ total: "42" }], // reviewRecords
        [{ total: "18" }], // todayLearnStatements
      ]);
      (service as any).db = db;

      const result = await service.getOverview();

      expect(result).toEqual({
        userCount: 12,
        activeToday: 3,
        coursePackCount: 5,
        statementCount: 700,
        totalReviewRecords: 42,
        todayLearnStatements: 18,
      });
    });

    it("returns 0 userCount when logto api fails", async () => {
      logtoApi.get.mockRejectedValue(new Error("down"));
      const db = makeDb([[], [], [], [], []]);
      (service as any).db = db;

      const result = await service.getOverview();

      expect(result.userCount).toBe(0);
      expect(result.activeToday).toBe(0);
    });
  });

  describe("listUsers 分页", () => {
    it("maps logto users with per-user aggregates and pagination meta", async () => {
      logtoApi.get.mockResolvedValue({
        data: [
          { id: "u1", username: "alice", createdAt: "2026-01-01T00:00:00Z" },
          { id: "u2", username: "bob", createdAt: "2026-02-01T00:00:00Z" },
        ],
        headers: { "total-number": "2" },
      });
      const db = makeDb([
        [{ userId: "u1", total: "7" }], // today
        [
          { userId: "u1", total: "100" },
          { userId: "u2", total: "5" },
        ], // total
        [{ userId: "u2", total: "3600" }], // duration
      ]);
      (service as any).db = db;

      const result = await service.listUsers({ page: 2, pageSize: 20, keyword: "a" });

      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(20);
      expect(result.total).toBe(2);
      expect(result.users).toHaveLength(2);
      expect(result.users[0]).toEqual({
        userId: "u1",
        username: "alice",
        createdAt: "2026-01-01T00:00:00Z",
        todayStatements: 7,
        totalStatements: 100,
        totalDurationSeconds: 0,
      });
      expect(result.users[1].totalStatements).toBe(5);
      expect(result.users[1].totalDurationSeconds).toBe(3600);
      expect(result.users[1].todayStatements).toBe(0);
      // keyword 透传给 logto
      expect(logtoApi.get).toHaveBeenCalledWith(
        "/api/users",
        expect.objectContaining({
          params: expect.objectContaining({ page: 2, page_size: 20, search: "a" }),
        }),
      );
    });

    it("returns empty list when logto fails and skips db queries", async () => {
      logtoApi.get.mockRejectedValue(new Error("down"));
      const db = makeDb([[]]);
      (service as any).db = db;

      const result = await service.listUsers({ page: 1, pageSize: 20 });

      expect(result.users).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe("listCoursePacks 分页", () => {
    it("排序键是确定性的: order 之后追加主键 id (order 大量为 0 时翻页不重不漏)", async () => {
      const db = makeDb([[], [{ total: "0" }]]) as unknown as Record<string, jest.Mock>;
      (service as any).db = db;

      await service.listCoursePacks({ page: 2, pageSize: 20 });

      // 新建课程包一律写 order=0 (createCoursePack / AI 建课), 单键排序时 Postgres 不保证
      // 行的先后; 配合 LIMIT/OFFSET 会让同一行出现在两页, 或者某一行一页都不出现。
      const sortKeys = db.orderBy.mock.calls[0] as unknown[];
      expect(sortKeys).toHaveLength(2);
      // 主键: 第一个键引用 coursePack.order (业务排序的主键), 不能是 id
      expect(referencesColumn(sortKeys[0], coursePack.order)).toBe(true);
      expect(referencesColumn(sortKeys[0], coursePack.id)).toBe(false);
      // 次键: 引用主键列 coursePack.id (不是常量 / 别名 / 别的列), 才能构成全序
      expect(referencesColumn(sortKeys[1], coursePack.id)).toBe(true);
      expect(referencesColumn(sortKeys[1], coursePack.order)).toBe(false);
      expect(sortKeys[0]).not.toBe(sortKeys[1]);

      // 只加排序键: 分页参数语义不变
      expect(db.limit).toHaveBeenCalledWith(20);
      expect(db.offset).toHaveBeenCalledWith(20);
    });

    it("returns course packs with counts and pagination meta", async () => {
      const db = makeDb([
        [
          {
            id: "p1",
            title: "Basics",
            isFree: true,
            status: "published",
            source: "manual",
            accessLevel: "free",
            createdAt: new Date("2026-03-01T00:00:00Z"),
            updatedAt: new Date("2026-03-02T00:00:00Z"),
            courseCount: "3",
            statementCount: "40",
          },
        ],
        [{ total: "1" }],
      ]);
      (service as any).db = db;

      const result = await service.listCoursePacks({ page: 1, pageSize: 20 });

      expect(result.total).toBe(1);
      expect(result.coursePacks[0]).toEqual({
        id: "p1",
        title: "Basics",
        isFree: true,
        status: "published",
        source: "manual",
        accessLevel: "free",
        courseCount: 3,
        statementCount: 40,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-02T00:00:00.000Z",
      });
    });
  });

  describe("toggleCoursePackFree", () => {
    it("flips access_level free <-> membership", async () => {
      let accessLevel = "membership";
      const db: Record<string, any> = {};
      db.query = {
        coursePack: {
          findFirst: jest.fn().mockImplementation(async () => ({ id: "p1", accessLevel })),
        },
      };
      db.update = jest.fn().mockReturnValue(db);
      db.set = jest.fn().mockImplementation((v: Record<string, unknown>) => {
        if (v.accessLevel) accessLevel = v.accessLevel as string;
        return db;
      });
      db.where = jest.fn().mockReturnValue(db);
      db.returning = jest.fn().mockResolvedValue([{ id: "p1", accessLevel }]);
      (service as any).db = db;

      expect(await service.toggleCoursePackFree("p1")).toEqual({ id: "p1", isFree: true });
      expect(await service.toggleCoursePackFree("p1")).toEqual({ id: "p1", isFree: false });
    });

    it("throws when pack not found", async () => {
      const db: Record<string, any> = {};
      db.query = { coursePack: { findFirst: jest.fn().mockResolvedValue(undefined) } };
      (service as any).db = db;

      await expect(service.toggleCoursePackFree("nope")).rejects.toThrow(
        "CoursePack with ID nope not found",
      );
    });
  });
});
