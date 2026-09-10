import { pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * 用户影子表 (Logto 投影)。
 * Logto 仍是认证/用户身份的真相源; 本表作为业务表 user_id 的 FK 锚点,
 * 并缓存少量展示字段 (username/avatar) 以避免频繁回查 Logto。
 * id 即 Logto user id, 由外部提供, 不自增。
 */
export const user = pgTable("users", {
  id: text("id").primaryKey(),
  username: varchar("username", { length: 64 }),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
});
