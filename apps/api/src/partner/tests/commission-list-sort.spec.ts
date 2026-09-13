import { commissionRecord } from "@earthworm/schema";
import { DbType } from "../../global/providers/db.provider";
import { PartnerService } from "../partner.service";

/**
 * 断言语义: 某个 SQL 表达式 (排序键) 是否**引用了**目标列。
 * drizzle 的 asc()/desc() 返回的是新建的 SQL 包装对象 (desc(commissionRecord.id) !== commissionRecord.id),
 * 拿它跟原始列做 toBe 引用比较永远为假 —— 只能顺着 queryChunks / Param.value 递归找列对象。
 * 详见 apps/api/src/admin/tests/admin.service.spec.ts 的同名工具。
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
 * GET /admin/commissions → PartnerService.listCommissions
 *
 * 防的回归: 单键排序 + LIMIT/OFFSET 的分页不稳定。
 * commission_records.created_at 在同一事务批量写入 (例如批量补录历史佣金/对账回填) 时会完全相同,
 * Postgres 对相同排序键的行不保证稳定顺序 —— 翻页时同一行可能出现在两页, 或者某一行一页都不出现。
 * 排序键必须由「createdAt + 主键」组成才能构成全序。
 */
describe("PartnerService.listCommissions 分页排序确定性", () => {
  function makeDb(responses: unknown[][]) {
    // 每个查询在 await 时依次消费 responses 中的一个结果数组; 链式方法统一返回 db
    const db: Record<string, any> = {};
    for (const m of ["select", "from", "where", "orderBy", "limit", "offset"]) {
      db[m] = jest.fn().mockReturnValue(db);
    }
    (db as any).then = (resolve: (v: unknown) => void) => {
      resolve(responses.length > 0 ? responses.shift() : []);
      return Promise.resolve();
    };
    return db as unknown as DbType;
  }

  it("createdAt 之后追加主键 id, 保证翻页不重不漏", async () => {
    // 第 1 个响应给列表查询, 第 2 个给 count(*);
    // 空列表时不会再有 users 补名查询, 两个响应足够。
    const db = makeDb([[], [{ total: "0" }]]) as unknown as Record<string, jest.Mock>;
    const service = new PartnerService(db as unknown as DbType);

    const result = await service.listCommissions({ page: 2, pageSize: 20 });

    const sortKeys = db.orderBy.mock.calls[0] as unknown[];
    expect(sortKeys).toHaveLength(2);
    // 第一个键: 引用业务排序依据 commission_records.created_at, 不能是 id
    expect(referencesColumn(sortKeys[0], commissionRecord.createdAt)).toBe(true);
    expect(referencesColumn(sortKeys[0], commissionRecord.id)).toBe(false);
    // 次键: 引用主键列 commission_records.id, 才能把 createdAt 相同的行排成全序
    expect(referencesColumn(sortKeys[1], commissionRecord.id)).toBe(true);
    expect(referencesColumn(sortKeys[1], commissionRecord.createdAt)).toBe(false);
    expect(sortKeys[0]).not.toBe(sortKeys[1]);

    // 只加排序键: 分页参数语义不变
    expect(db.limit).toHaveBeenCalledWith(20);
    expect(db.offset).toHaveBeenCalledWith(20);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(20);
  });
});
