import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { DB, DbType } from "../../global/providers/db.provider";
import { LogtoService } from "../../logto/logto.service";
import { AdminService } from "../admin.service";

/**
 * 回归: Logto Management API 的 GET /api/users 返回的是**数组**, 没有 totalCount 字段;
 * 真实总数只在响应头 total-number (字符串) 里。
 * 旧实现读 data.totalCount → undefined → 0, 且 catch 里静默吞错, 于是 userCount 永远是 0。
 * 这里的 mock 固定成真实响应形状 (数组 + 响应头), 旧实现会立刻变红。
 */
describe("AdminService userCount (Logto total-number 响应头)", () => {
  let service: AdminService;
  let logtoApi: { get: jest.Mock };
  let warnSpy: jest.SpyInstance;

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
    warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: DB, useValue: {} as DbType },
        { provide: LogtoService, useValue: { logtoApi } as unknown as LogtoService },
      ],
    }).compile();
    service = moduleRef.get(AdminService);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("userCount 取自响应头 total-number, 请求参数保持不变", async () => {
    logtoApi.get.mockResolvedValue({
      data: [{ id: "mrdun", username: "mrdun", createdAt: "2026-01-01T00:00:00Z" }],
      headers: { "total-number": "2" },
    });
    (service as any).db = makeDb([[], [], [], [], []]);

    const result = await service.getOverview();

    expect(result.userCount).toBe(2);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logtoApi.get).toHaveBeenCalledWith("/api/users", {
      params: { page: 1, page_size: 1, include_default_role: true },
    });
  });

  it("响应头是字符串类型的 total-number 也能安全转数字, 且真实的 0 不被当成取不到", async () => {
    logtoApi.get.mockResolvedValue({ data: [], headers: { "total-number": "0" } });
    (service as any).db = makeDb([[], [], [], [], []]);

    const result = await service.getOverview();

    expect(result.userCount).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("响应头缺失时降级为当前页条数, 并 warn 说明取不到总数", async () => {
    logtoApi.get.mockResolvedValue({
      data: [{ id: "u1", username: "alice", createdAt: null }],
      headers: {},
    });
    (service as any).db = makeDb([[], [], [], [], []]);

    const result = await service.getOverview();

    expect(result.userCount).toBe(1); // 旧写法在这里返回 0
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("total-number");
    expect(String(warnSpy.mock.calls[0][0])).toContain("降级");
  });

  it("响应头不是合法数字时同样降级为当前页条数并 warn", async () => {
    logtoApi.get.mockResolvedValue({
      data: [{ id: "u1" }, { id: "u2" }],
      headers: { "total-number": "not-a-number" },
    });
    (service as any).db = makeDb([[], [], [], [], []]);

    const result = await service.getOverview();

    expect(result.userCount).toBe(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("Logto 请求抛错时记录 warn(含原因), 不被静默吞掉", async () => {
    logtoApi.get.mockRejectedValue(new Error("request failed with status 401"));
    (service as any).db = makeDb([[], [], [], [], []]);

    const result = await service.getOverview();

    expect(result.userCount).toBe(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("request failed with status 401");
  });

  describe("listUsers 同源字段 (同一个响应头)", () => {
    it("total 取自 total-number 响应头, 用户列表来自数组响应体", async () => {
      logtoApi.get.mockResolvedValue({
        data: [
          { id: "u1", username: "alice", createdAt: "2026-01-01T00:00:00Z" },
          { id: "u2", username: "bob", createdAt: "2026-02-01T00:00:00Z" },
        ],
        headers: { "total-number": "2" },
      });
      (service as any).db = makeDb([[], [], []]);

      const result = await service.listUsers({ page: 1, pageSize: 20 });

      expect(result.total).toBe(2);
      expect(result.users).toHaveLength(2);
      expect(result.users[0].userId).toBe("u1");
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("Logto 抛错时仍返回空列表(保持接口契约), 但记录 warn", async () => {
      logtoApi.get.mockRejectedValue(new Error("down"));
      (service as any).db = makeDb([[]]);

      const result = await service.listUsers({ page: 1, pageSize: 20 });

      expect(result.users).toEqual([]);
      expect(result.total).toBe(0);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });
});
