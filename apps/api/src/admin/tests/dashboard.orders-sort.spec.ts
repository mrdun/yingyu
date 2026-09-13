import { orders } from "@earthworm/schema";
import { DbType } from "../../global/providers/db.provider";
import { DashboardService } from "../dashboard.service";

/**
 * 断言语义与 admin.service.spec.ts 里的同名工具一致: 某个 SQL 表达式 (排序键) 是否**引用了**目标列。
 *
 * drizzle 的 asc()/desc() 返回的是新建的 SQL 包装对象, 不是传进去的列本身
 * (desc(orders.id) !== orders.id), 所以不能拿返回值跟列做引用相等 (toBe) —— 那测的是
 * "两个对象是不是同一个", 永远为假。这里顺着 SQL 结构 (queryChunks / Param.value) 递归找列对象:
 * 引用了 orders.id 就命中; 引用的是别的列或常量则不会命中。
 * 只沿 SQL 结构下钻, 不遍历任意属性: Column 上有 table/columns 回指, 泛化遍历会让
 * orders.createdAt "绕回" orders.id, 反而失去区分能力。
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

/**
 * GET /admin/dashboard/orders → DashboardService.listOrders
 *
 * 防的回归: 单键排序 + LIMIT/OFFSET 的分页不稳定。
 * orders.created_at 在同一事务批量写入 (或批量补录/回填) 时会完全相同, Postgres 对相同排序键
 * 的行不保证稳定顺序 —— 翻页时同一行可能出现在两页, 或者某一行一页都不出现。
 * 排序键必须由「createdAt + 主键」组成才能构成全序。
 */
describe("DashboardService.listOrders 分页排序确定性", () => {
  function makeDb(responses: unknown[][]) {
    // 每个查询在 await 时依次消费 responses 中的一个结果数组; 链式方法统一返回 db
    const db: Record<string, any> = {};
    for (const m of ["select", "from", "leftJoin", "where", "orderBy", "limit", "offset"]) {
      db[m] = jest.fn().mockReturnValue(db);
    }
    (db as any).then = (resolve: (v: unknown) => void) => {
      resolve(responses.length > 0 ? responses.shift() : []);
      return Promise.resolve();
    };
    return db as unknown as DbType;
  }

  it("createdAt 之后追加主键 id, 保证翻页不重不漏", async () => {
    // 第 1 个响应给列表查询, 第 2 个给 count(*)
    const db = makeDb([[], [{ total: "0" }]]) as unknown as Record<string, jest.Mock>;
    const service = new DashboardService(db as unknown as DbType);

    await service.listOrders({ page: 2, limit: 20 });

    const sortKeys = db.orderBy.mock.calls[0] as unknown[];
    expect(sortKeys).toHaveLength(2);
    // 第一个键: 引用业务排序依据 orders.created_at, 不能是 id
    expect(referencesColumn(sortKeys[0], orders.createdAt)).toBe(true);
    expect(referencesColumn(sortKeys[0], orders.id)).toBe(false);
    // 次键: 引用主键列 orders.id (不是常量 / 别名 / 别的列), 才能把 createdAt 相同的行排成全序
    expect(referencesColumn(sortKeys[1], orders.id)).toBe(true);
    expect(referencesColumn(sortKeys[1], orders.createdAt)).toBe(false);
    expect(sortKeys[0]).not.toBe(sortKeys[1]);

    // 只加排序键: 分页参数语义不变
    expect(db.limit).toHaveBeenCalledWith(20);
    expect(db.offset).toHaveBeenCalledWith(20);
  });
});
