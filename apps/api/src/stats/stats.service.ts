import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, sql } from "drizzle-orm";

import {
  masteredElements,
  reviewRecords,
  userLearningActivities,
  userLearnRecord,
} from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface StatsOverview {
  totalLearnDays: number;
  totalStatements: number;
  totalLearnDurationSeconds: number;
  reviewStreak: number;
  masteredCount: number;
}

export interface DailyStat {
  date: string;
  statements: number;
  durationSeconds: number;
}

function toDateStr(d: Date): string {
  // 与项目其他地方保持一致, 使用 UTC 日期字符串 (YYYY-MM-DD)
  return d.toISOString().split("T")[0];
}

/**
 * 连续复习天数: 基于 review_records.lastReviewedAt 的日期去重集合,
 * 从今天往回数; 今天没有记录时从昨天开始数; 遇到断档即归零。
 */
export function computeReviewStreak(reviewedDates: string[], today: Date): number {
  const set = new Set(reviewedDates);
  const start = new Date(today);
  if (!set.has(toDateStr(start))) {
    start.setTime(start.getTime() - DAY_MS);
  }
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    if (!set.has(toDateStr(start))) break;
    streak++;
    start.setTime(start.getTime() - DAY_MS);
  }
  return streak;
}

/**
 * 最近 N 天的每日统计, 无数据的天补零。
 */
export function buildDailySeries(
  days: number,
  today: Date,
  statementByDate: Record<string, number>,
  durationByDate: Record<string, number>,
): DailyStat[] {
  const series: DailyStat[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    const date = toDateStr(d);
    series.push({
      date,
      statements: statementByDate[date] ?? 0,
      durationSeconds: durationByDate[date] ?? 0,
    });
  }
  return series;
}

@Injectable()
export class StatsService {
  constructor(@Inject(DB) private db: DbType) {}

  async getOverview(userId: string): Promise<StatsOverview> {
    const [learn] = await this.db
      .select({
        totalLearnDays: sql<number>`count(*)`,
        totalStatements: sql<number>`coalesce(sum(${userLearnRecord.count}), 0)`,
      })
      .from(userLearnRecord)
      .where(eq(userLearnRecord.userId, userId));

    const [duration] = await this.db
      .select({
        total: sql<number>`coalesce(sum(${userLearningActivities.duration}), 0)`,
      })
      .from(userLearningActivities)
      .where(eq(userLearningActivities.userId, userId));

    const reviewRows = await this.db
      .select({ lastReviewedAt: reviewRecords.lastReviewedAt })
      .from(reviewRecords)
      .where(eq(reviewRecords.userId, userId));

    const [mastered] = await this.db
      .select({ total: sql<number>`count(*)` })
      .from(masteredElements)
      .where(eq(masteredElements.userId, userId));

    const reviewedDates = reviewRows
      .filter((r) => r.lastReviewedAt)
      .map((r) => toDateStr(new Date(r.lastReviewedAt as Date)));

    return {
      totalLearnDays: Number(learn?.totalLearnDays ?? 0),
      totalStatements: Number(learn?.totalStatements ?? 0),
      totalLearnDurationSeconds: Number(duration?.total ?? 0),
      reviewStreak: computeReviewStreak(reviewedDates, new Date()),
      masteredCount: Number(mastered?.total ?? 0),
    };
  }

  async getDaily(userId: string, days: number): Promise<DailyStat[]> {
    const today = new Date();
    const start = new Date(today.getTime() - (days - 1) * DAY_MS);
    const startStr = toDateStr(start);

    const stmtRows = await this.db
      .select({
        day: userLearnRecord.day,
        statements: sql<number>`coalesce(sum(${userLearnRecord.count}), 0)`,
      })
      .from(userLearnRecord)
      .where(and(eq(userLearnRecord.userId, userId), gte(userLearnRecord.day, startStr)))
      .groupBy(userLearnRecord.day);

    const durationRows = await this.db
      .select({
        date: userLearningActivities.date,
        total: sql<number>`coalesce(sum(${userLearningActivities.duration}), 0)`,
      })
      .from(userLearningActivities)
      .where(
        and(eq(userLearningActivities.userId, userId), gte(userLearningActivities.date, startStr)),
      )
      .groupBy(userLearningActivities.date);

    const statementByDate: Record<string, number> = {};
    for (const row of stmtRows) {
      statementByDate[String(row.day)] = Number(row.statements) || 0;
    }

    const durationByDate: Record<string, number> = {};
    for (const row of durationRows) {
      durationByDate[String(row.date)] = Number(row.total) || 0;
    }

    return buildDailySeries(days, today, statementByDate, durationByDate);
  }
}
