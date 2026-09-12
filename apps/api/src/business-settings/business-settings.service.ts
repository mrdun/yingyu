import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";

import { businessSettings } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";

export const REFUND_WINDOW_HOURS_KEY = "refund_window_hours";
export const DEFAULT_REFUND_WINDOW_HOURS = 24;

/**
 * 商业运营配置 (key-value)。
 * 读取失败时回退到默认值, 不阻断主流程。
 */
@Injectable()
export class BusinessSettingsService {
  constructor(@Inject(DB) private db: DbType) {}

  async get(key: string, db: DbType = this.db): Promise<string | null> {
    const row = await db.query.businessSettings.findFirst({
      where: eq(businessSettings.key, key),
    });
    return row?.value ?? null;
  }

  async getNumber(key: string, fallback: number, db: DbType = this.db): Promise<number> {
    const value = await this.get(key, db);
    const parsed = value == null ? NaN : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  async set(key: string, value: string): Promise<{ key: string; value: string }> {
    const [row] = await this.db
      .insert(businessSettings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: businessSettings.key,
        set: { value, updatedAt: new Date() },
      })
      .returning();
    return { key: row.key, value: row.value };
  }

  async getAll() {
    return await this.db.query.businessSettings.findMany({
      orderBy: asc(businessSettings.key),
    });
  }

  async getRefundWindowHours(db: DbType = this.db): Promise<number> {
    return await this.getNumber(REFUND_WINDOW_HOURS_KEY, DEFAULT_REFUND_WINDOW_HOURS, db);
  }
}
