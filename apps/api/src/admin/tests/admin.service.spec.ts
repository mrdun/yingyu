import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";

import { DB, DbType } from "../../global/providers/db.provider";
import { LogtoService } from "../../logto/logto.service";
import { AdminController } from "../admin.controller";
import { AdminService } from "../admin.service";

const TODAY = new Date("2026-08-29T12:00:00.000Z");

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
      logtoApi.get.mockResolvedValue({ data: { totalCount: 12, data: [] } });
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
        data: {
          totalCount: 2,
          data: [
            { id: "u1", username: "alice", createdAt: "2026-01-01T00:00:00Z" },
            { id: "u2", username: "bob", createdAt: "2026-02-01T00:00:00Z" },
          ],
        },
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
    it("returns course packs with counts and pagination meta", async () => {
      const db = makeDb([
        [
          {
            id: "p1",
            title: "Basics",
            isFree: true,
            createdAt: new Date("2026-03-01T00:00:00Z"),
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
        courseCount: 3,
        statementCount: 40,
        createdAt: "2026-03-01T00:00:00.000Z",
      });
    });
  });

  describe("toggleCoursePackFree", () => {
    it("flips isFree", async () => {
      const db: Record<string, any> = {};
      db.query = {
        coursePack: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({ id: "p1", isFree: false })
            .mockResolvedValueOnce({ id: "p1", isFree: true }),
        },
      };
      db.update = jest.fn().mockReturnValue(db);
      db.set = jest.fn().mockReturnValue(db);
      db.where = jest.fn().mockResolvedValue(undefined);
      (service as any).db = db;

      expect(await service.toggleCoursePackFree("p1")).toEqual({ id: "p1", isFree: true });
      expect(await service.toggleCoursePackFree("p1")).toEqual({ id: "p1", isFree: false });
    });

    it("throws when pack not found", async () => {
      const db: Record<string, any> = {};
      db.query = { coursePack: { findFirst: jest.fn().mockResolvedValue(undefined) } };
      (service as any).db = db;

      await expect(service.toggleCoursePackFree("nope")).rejects.toThrow("course pack not found");
    });
  });
});
