/**
 * RC 数据库辅助脚本 (TASK-002-L-01)。
 *
 * 放在 packages/db 下, 因为 `postgres` 是该 workspace 包的依赖 (根目录无法解析)。
 *
 * 用法 (在仓库根目录):
 *   node packages/db/scripts/rc-db.mjs reset [dbName]    # 重建 RC 库 (含 drop!)
 *   node packages/db/scripts/rc-db.mjs drop  [dbName]    # 删除 RC 库
 *   node packages/db/scripts/rc-db.mjs verify [dbName]   # 校验迁移结果与 seed 数据
 *
 * 安全: 仅允许操作名称以 `_rc` 或等于 `earthworm_rc` 的库, 避免误删开发/测试库。
 */
import postgres from "postgres";

const [, , action = "verify", dbArg = "earthworm_rc"] = process.argv;
const RC_DB = dbArg;

if (!/^earthworm_rc$|_rc$/.test(RC_DB)) {
  console.error(`拒绝对非 RC 库执行操作: ${RC_DB} (库名必须以 _rc 结尾)`);
  process.exit(1);
}

const ADMIN_URL =
  process.env.RC_ADMIN_DATABASE_URL ?? "postgres://test:password@localhost:5480/postgres";
const RC_URL = process.env.RC_DATABASE_URL ?? ADMIN_URL.replace(/\/[^/]+$/, `/${RC_DB}`);

if (action === "reset" || action === "drop") {
  const admin = postgres(ADMIN_URL);
  await admin.unsafe(`DROP DATABASE IF EXISTS ${RC_DB}`);
  if (action === "reset") {
    await admin.unsafe(`CREATE DATABASE ${RC_DB}`);
  }
  await admin.end();
  console.log(action === "reset" ? `已重建 RC 库: ${RC_DB}` : `已删除 RC 库: ${RC_DB}`);
  process.exit(0);
}

const sql = postgres(RC_URL);
const [tables] = await sql`
  SELECT count(*)::int AS c FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
const plans =
  await sql`SELECT id, price_fen, duration_days, is_active, is_public FROM plans ORDER BY sort_order`;
const rules =
  await sql`SELECT partner_type, plan_id, rate_bps, status FROM partner_commission_rules`;
const settings = await sql`SELECT key, value FROM business_settings ORDER BY key`;
const [entitlements] = await sql`SELECT count(*)::int AS c FROM plan_entitlements`;
const coursePacks =
  await sql`SELECT id, title, status, access_level, is_free FROM course_packs ORDER BY "order"`;
const [statements] = await sql`SELECT count(*)::int AS c FROM statements`;
const [paths] = await sql`SELECT count(*)::int AS c FROM learning_paths WHERE is_published = true`;
const [users] = await sql`SELECT count(*)::int AS c FROM users`;

console.log(
  JSON.stringify(
    {
      database: RC_DB,
      tables: tables.c,
      plans,
      commissionRules: rules,
      settings,
      entitlements: entitlements.c,
      coursePacks,
      statements: statements.c,
      publishedLearningPaths: paths.c,
      users: users.c,
      checks: {
        tableCountOk: tables.c === 29,
        plansSeeded: plans.length === 4,
        commissionRuleSeeded: rules.length >= 1,
        coursePacksVisible:
          coursePacks.length > 0 && coursePacks.every((p) => p.status === "published"),
      },
    },
    null,
    2,
  ),
);
await sql.end();
