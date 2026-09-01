import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import {
  coinTransactions,
  courseRating,
  dailyTasks,
  reviewRecords,
  userCoins,
  userLearnRecord,
} from "@earthworm/schema";
import type { TaskType } from "./dto/check-in.dto";
import { DB, DbType } from "../global/providers/db.provider";
import { CheckInContext, CheckInSnapshot } from "./coins.rules";

@Injectable()
export class CoinsContext implements CheckInContext {
  constructor(@Inject(DB) private db: DbType) {}

  private todayStart(today: string): string {
    // postgres.js 3.4.4 绑定 Date 参数会崩 (bytes.js str), 统一用 ISO 字符串
    return `${today}T00:00:00.000Z`;
  }

  async getSnapshot(userId: string, today: string, taskType: TaskType): Promise<CheckInSnapshot> {
    const start = this.todayStart(today);

    const [study] = await this.db
      .select({ count: sql<number>`coalesce(sum(${userLearnRecord.count}), 0)` })
      .from(userLearnRecord)
      .where(sql`${userLearnRecord.userId} = ${userId} and ${userLearnRecord.day} = ${today}`);

    const [sss] = await this.db
      .select({ total: sql<number>`count(*)` })
      .from(courseRating)
      .where(
        sql`${courseRating.userId} = ${userId} and ${courseRating.grade} = 'SSS' and ${courseRating.createdAt} >= ${start}`,
      );

    const [review] = await this.db
      .select({ total: sql<number>`count(*)` })
      .from(reviewRecords)
      .where(
        sql`${reviewRecords.userId} = ${userId} and ${reviewRecords.lastReviewedAt} >= ${start}`,
      );

    const existingTaskRows = await this.db
      .select({ id: dailyTasks.id })
      .from(dailyTasks)
      .where(
        sql`${dailyTasks.userId} = ${userId} and ${dailyTasks.date} = ${today} and ${dailyTasks.taskType} = ${taskType}`,
      );

    const completedRows = await this.db
      .select({ date: dailyTasks.date })
      .from(dailyTasks)
      .where(sql`${dailyTasks.userId} = ${userId} and ${dailyTasks.completed} = true`);

    const bonusRows = await this.db
      .select({ relatedId: coinTransactions.relatedId })
      .from(coinTransactions)
      .where(
        sql`${coinTransactions.userId} = ${userId} and ${coinTransactions.reason} = 'streak_bonus' and ${coinTransactions.createdAt} >= ${start}`,
      );

    return {
      todayStudyCount: Number(study?.count ?? 0),
      hasSssToday: Number(sss?.total ?? 0) > 0,
      hasReviewToday: Number(review?.total ?? 0) > 0,
      existingTask: existingTaskRows.length > 0,
      completedDates: [...new Set(completedRows.map((r) => r.date))],
      streakBonusDates: bonusRows.map((r) => r.relatedId ?? "").filter(Boolean),
    };
  }

  async insertDailyTask(userId: string, today: string, taskType: TaskType, rewardCoins: number) {
    const inserted = await this.db
      .insert(dailyTasks)
      .values({ userId, date: today, taskType, completed: true, rewardCoins })
      .onConflictDoNothing({
        target: [dailyTasks.userId, dailyTasks.date, dailyTasks.taskType],
      })
      .returning({ id: dailyTasks.id });
    return inserted.length > 0;
  }

  async addCoins(userId: string, amount: number) {
    await this.db
      .insert(userCoins)
      .values({ userId, coins: amount })
      .onConflictDoUpdate({
        target: userCoins.userId,
        set: { coins: sql`${userCoins.coins} + ${amount}`, updatedAt: new Date() },
      });
  }

  async addTransaction(userId: string, amount: number, reason: string, relatedId: string | null) {
    await this.db.insert(coinTransactions).values({ userId, amount, reason, relatedId });
  }

  async getTodayEarned(userId: string, today: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<number>`coalesce(sum(${coinTransactions.amount}), 0)` })
      .from(coinTransactions)
      .where(
        sql`${coinTransactions.userId} = ${userId} and ${coinTransactions.amount} > 0 and ${coinTransactions.createdAt} >= ${this.todayStart(today)}`,
      );
    return Number(row?.total ?? 0);
  }
}
