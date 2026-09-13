import { JwtModule } from "@nestjs/jwt";
import { TestingModule } from "@nestjs/testing";
import { sql } from "drizzle-orm";
import { DbType } from "src/global/providers/db.provider";

import { user } from "@earthworm/schema";
import { GlobalModule } from "../../src/global/global.module";
import { LogtoService } from "../../src/logto/logto.service";
import { MockRedisModule } from "./mockRedis";

export async function cleanDB(db: DbType) {
  await db.execute(
    sql`TRUNCATE TABLE courses, statements, "course_packs" , "user_course_progress", "course_history", "user_learning_activities", "mastered_elements", "memberships", "user_learn_record", "orders", "user_coins", "coin_transactions", "daily_tasks", "learning_paths", "learning_path_items", "picture_words", "plan_entitlements", "plans" RESTART IDENTITY CASCADE;`,
  );
}

export async function signin(builder: TestingModule) {
  const logto = builder.get(LogtoService);
  return await logto.fetchToken();
}

/**
 * 取 JWT 的 sub (测试里用来造 users 影子表行)。
 * 只做 base64 解码, 不验签 —— 测试数据准备用途。
 */
export function tokenSubject(token: string): string {
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  return payload.sub as string;
}

/**
 * 确保 users 影子表里有该 token 对应的用户。
 *
 * 生产环境这行是登录后由 GET /user/current (syncShadowUser) 写入的;
 * 测试里直接打业务接口 (下单/佣金等) 时不会经过登录, 因此必须显式造出来,
 * 否则会撞 orders_user_id_users_id_fk 等外键。
 */
export async function ensureUser(db: DbType, token: string, username = "e2e-user") {
  const id = tokenSubject(token);
  await db.insert(user).values({ id, username }).onConflictDoNothing();
  return id;
}

export const testImportModules = [
  MockRedisModule,
  GlobalModule,
  JwtModule.register({
    secret: process.env.SECRET,
    signOptions: { expiresIn: "7d" },
  }),
];
