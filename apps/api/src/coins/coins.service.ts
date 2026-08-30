import { Inject, Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";

import {
  courseRating,
  dailyTasks,
  reviewRecords,
  userCoins,
  userLearnRecord,
} from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";
import { CoinsContext } from "./coins.context";
import { processCheckIn, TASK_DEFS, toDateStr } from "./coins.rules";
import { TASK_TYPES, TaskType } from "./dto/check-in.dto";

@Injectable()
export class CoinsService {
  constructor(
    @Inject(DB) private db: DbType,
    private readonly ctx: CoinsContext,
  ) {}

  private today(): string {
    return toDateStr(new Date());
  }

  async getBalance(userId: string): Promise<{ coins: number; todayEarned: number }> {
    const [row] = await this.db
      .select({ coins: userCoins.coins })
      .from(userCoins)
      .where(eq(userCoins.userId, userId));
    const todayEarned = await this.ctx.getTodayEarned(userId, this.today());
    return { coins: Number(row?.coins ?? 0), todayEarned };
  }

  async checkIn(userId: string, taskType: TaskType) {
    return await processCheckIn(this.ctx, userId, taskType, this.today());
  }

  /**
   * 今日任务列表 (供 /rewards 页面渲染): 每个任务带进度、达标状态与领取状态
   */
  async getTodayTasks(userId: string) {
    const today = this.today();
    const start = new Date(`${today}T00:00:00.000Z`);

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

    const taskRows = await this.db
      .select({ taskType: dailyTasks.taskType })
      .from(dailyTasks)
      .where(sql`${dailyTasks.userId} = ${userId} and ${dailyTasks.date} = ${today}`);

    const claimed = new Set(taskRows.map((r) => r.taskType));
    const studyCount = Number(study?.count ?? 0);
    const progress: Record<TaskType, { target: number; current: number }> = {
      study_10: { target: 10, current: studyCount },
      study_30: { target: 30, current: studyCount },
      review_done: { target: 1, current: Number(review?.total ?? 0) },
      sss_once: { target: 1, current: Number(sss?.total ?? 0) },
    };

    return {
      tasks: TASK_TYPES.map((taskType) => {
        const p = progress[taskType];
        return {
          taskType,
          label: TASK_DEFS[taskType].label,
          rewardCoins: TASK_DEFS[taskType].reward,
          target: p.target,
          current: p.current,
          goalMet: p.current >= p.target,
          claimed: claimed.has(taskType),
        };
      }),
    };
  }
}
