import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 商业运营配置 (最小 key-value)。
 * 例: refund_window_hours=24
 * value 以字符串存储, 读取时按需解析。
 */
export const businessSettings = pgTable("business_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
