import { isUniqueViolationError, PG_UNIQUE_VIOLATION } from "../db-errors";

/**
 * PG 错误码判定 (纯函数, 不依赖数据库)。
 *
 * 为什么需要它: 学习路线条目上的 unique(learning_path_id, course_pack_id) 在并发
 * 提交时只能由数据库兜底拒绝。若把驱动异常原样抛出, 管理端会看到 500 —— 这条断言
 * 保证 23505 一定被认出来 (转成 409), 而不是靠人工在代码里"记得"。
 * drizzle 可能把原异常包一层并放到 cause, 所以两种形态都要认。
 */

describe("isUniqueViolationError", () => {
  it("识别驱动直接抛出的 23505", () => {
    expect(isUniqueViolationError({ code: PG_UNIQUE_VIOLATION })).toBe(true);
  });

  it("识别被包装在 cause 上的 23505", () => {
    expect(isUniqueViolationError({ cause: { code: PG_UNIQUE_VIOLATION } })).toBe(true);

    // 不依赖 ES2022 的 ErrorOptions 重载: 直接挂 cause
    const wrapped = new Error("wrapped") as Error & { cause?: unknown };
    wrapped.cause = { code: "23505" };
    expect(isUniqueViolationError(wrapped)).toBe(true);
  });

  it("其它错误码 / 异常形态一律不认 (不能把 500 误报成 409)", () => {
    expect(isUniqueViolationError({ code: "23503" })).toBe(false); // FK violation
    expect(isUniqueViolationError({ cause: { code: "23502" } })).toBe(false);
    expect(isUniqueViolationError(new Error("boom"))).toBe(false);
    expect(isUniqueViolationError(null)).toBe(false);
    expect(isUniqueViolationError(undefined)).toBe(false);
    expect(isUniqueViolationError("23505")).toBe(false);
  });
});
