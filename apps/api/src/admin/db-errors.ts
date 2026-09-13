/**
 * PostgreSQL 错误码判定 (管理端写接口用)。
 *
 * 背景: learning_path_items 上有 unique(learning_path_id, course_pack_id) 约束
 * (packages/db/drizzle/0032_learning_path_picture_pack... 建表 SQL)。
 * 业务层先做一次查重可以挡住绝大多数重复提交, 但两个并发请求仍可能同时通过查重,
 * 由数据库约束兜底拒绝 —— 那时若把驱动异常直接抛出去就是 500, 前端只能看到
 * "服务器错误", 无法知道原因。这里把 23505 认出来, 转成可读的 409。
 *
 * drizzle 会把驱动异常原样抛出 (postgres-js 的 PostgresError.code = SQLSTATE),
 * 某些版本会再包一层并把原异常放在 cause 上, 所以两处都认。
 */

/** SQLSTATE: unique_violation */
export const PG_UNIQUE_VIOLATION = "23505";

export function isUniqueViolationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  if ((error as { code?: unknown }).code === PG_UNIQUE_VIOLATION) return true;

  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    if ((cause as { code?: unknown }).code === PG_UNIQUE_VIOLATION) return true;
  }

  return false;
}
