import { Inject, Injectable } from "@nestjs/common";
import { and, count, eq, sql } from "drizzle-orm";

import {
  course,
  coursePack,
  reviewRecords,
  statement,
  userLearningActivities,
  userLearnRecord,
} from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";
import { LogtoService } from "../logto/logto.service";

export interface AdminOverview {
  userCount: number;
  activeToday: number;
  coursePackCount: number;
  statementCount: number;
  totalReviewRecords: number;
  todayLearnStatements: number;
}

export interface AdminUserRow {
  userId: string;
  username: string | null;
  createdAt: string | null;
  todayStatements: number;
  totalStatements: number;
  totalDurationSeconds: number;
}

export interface AdminUserList {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminCoursePackRow {
  id: string;
  title: string;
  isFree: boolean;
  courseCount: number;
  statementCount: number;
  createdAt: string;
}

export interface AdminCoursePackList {
  coursePacks: AdminCoursePackRow[];
  total: number;
  page: number;
  pageSize: number;
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(DB) private db: DbType,
    private readonly logtoService: LogtoService,
  ) {}

  async getOverview(): Promise<AdminOverview> {
    const day = todayStr();

    const [
      userCount,
      activeToday,
      coursePackCount,
      statementCount,
      totalReviewRecords,
      todayLearnStatements,
    ] = await Promise.all([
      this.countUsers(),
      this.countActiveToday(day),
      this.countCoursePacks(),
      this.countStatements(),
      this.countReviewRecords(),
      this.sumTodayLearnStatements(day),
    ]);

    return {
      userCount,
      activeToday,
      coursePackCount,
      statementCount,
      totalReviewRecords,
      todayLearnStatements,
    };
  }

  private async countUsers(): Promise<number> {
    try {
      const { data } = await this.logtoService.logtoApi.get("/api/users", {
        params: { page: 1, page_size: 1, include_default_role: true },
      });
      return Number(data?.totalCount ?? 0);
    } catch {
      return 0;
    }
  }

  private async countActiveToday(day: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<number>`count(distinct ${userLearnRecord.userId})` })
      .from(userLearnRecord)
      .where(eq(userLearnRecord.day, day));
    return Number(row?.total ?? 0);
  }

  private async countCoursePacks(): Promise<number> {
    const [row] = await this.db.select({ total: count() }).from(coursePack);
    return Number(row?.total ?? 0);
  }

  private async countStatements(): Promise<number> {
    const [row] = await this.db.select({ total: count() }).from(statement);
    return Number(row?.total ?? 0);
  }

  private async countReviewRecords(): Promise<number> {
    const [row] = await this.db.select({ total: count() }).from(reviewRecords);
    return Number(row?.total ?? 0);
  }

  private async sumTodayLearnStatements(day: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<number>`coalesce(sum(${userLearnRecord.count}), 0)` })
      .from(userLearnRecord)
      .where(eq(userLearnRecord.day, day));
    return Number(row?.total ?? 0);
  }

  async listUsers(params: {
    page: number;
    pageSize: number;
    keyword?: string;
  }): Promise<AdminUserList> {
    const { page, pageSize, keyword } = params;

    // 用户目录在 Logto, 通过 Management API 分页获取
    let logtoUsers: Array<{ id: string; username: string | null; createdAt: string | null }> = [];
    let total = 0;
    try {
      const { data } = await this.logtoService.logtoApi.get("/api/users", {
        params: {
          page,
          page_size: pageSize,
          include_default_role: true,
          ...(keyword ? { search: keyword } : {}),
        },
      });
      total = Number(data?.totalCount ?? 0);
      logtoUsers = (data?.data ?? []).map((u) => ({
        id: u.id,
        username: u.username ?? null,
        createdAt: u.createdAt ?? null,
      }));
    } catch {
      // Logto 不可用时返回空列表
    }

    const ids = logtoUsers.map((u) => u.id);
    const today = todayStr();

    const todayMap: Record<string, number> = {};
    const totalMap: Record<string, number> = {};
    const durationMap: Record<string, number> = {};

    if (ids.length > 0) {
      const [todayRows, totalRows, durationRows] = await Promise.all([
        this.db
          .select({
            userId: userLearnRecord.userId,
            total: sql<number>`coalesce(sum(${userLearnRecord.count}), 0)`,
          })
          .from(userLearnRecord)
          .where(and(eq(userLearnRecord.day, today), sql`${userLearnRecord.userId} = any(${ids})`))
          .groupBy(userLearnRecord.userId),
        this.db
          .select({
            userId: userLearnRecord.userId,
            total: sql<number>`coalesce(sum(${userLearnRecord.count}), 0)`,
          })
          .from(userLearnRecord)
          .where(sql`${userLearnRecord.userId} = any(${ids})`)
          .groupBy(userLearnRecord.userId),
        this.db
          .select({
            userId: userLearningActivities.userId,
            total: sql<number>`coalesce(sum(${userLearningActivities.duration}), 0)`,
          })
          .from(userLearningActivities)
          .where(sql`${userLearningActivities.userId} = any(${ids})`)
          .groupBy(userLearningActivities.userId),
      ]);

      for (const r of todayRows) todayMap[r.userId] = Number(r.total) || 0;
      for (const r of totalRows) totalMap[r.userId] = Number(r.total) || 0;
      for (const r of durationRows) durationMap[r.userId] = Number(r.total) || 0;
    }

    return {
      users: logtoUsers.map((u) => ({
        userId: u.id,
        username: u.username,
        createdAt: u.createdAt,
        todayStatements: todayMap[u.id] ?? 0,
        totalStatements: totalMap[u.id] ?? 0,
        totalDurationSeconds: durationMap[u.id] ?? 0,
      })),
      total,
      page,
      pageSize,
    };
  }

  async listCoursePacks(params: { page: number; pageSize: number }): Promise<AdminCoursePackList> {
    const { page, pageSize } = params;
    const offset = (page - 1) * pageSize;

    const rows = await this.db
      .select({
        id: coursePack.id,
        title: coursePack.title,
        isFree: coursePack.isFree,
        createdAt: coursePack.createdAt,
        courseCount: sql<number>`count(distinct ${course.id})`,
        statementCount: sql<number>`count(${statement.id})`,
      })
      .from(coursePack)
      .leftJoin(course, eq(course.coursePackId, coursePack.id))
      .leftJoin(statement, eq(statement.courseId, course.id))
      .groupBy(coursePack.id)
      .orderBy(coursePack.order)
      .limit(pageSize)
      .offset(offset);

    const [totalRow] = await this.db.select({ total: count() }).from(coursePack);

    return {
      coursePacks: rows.map((r) => ({
        id: r.id,
        title: r.title,
        isFree: Boolean(r.isFree),
        courseCount: Number(r.courseCount) || 0,
        statementCount: Number(r.statementCount) || 0,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
      })),
      total: Number(totalRow?.total ?? 0),
      page,
      pageSize,
    };
  }

  async toggleCoursePackFree(id: string): Promise<{ id: string; isFree: boolean }> {
    const existing = await this.db.query.coursePack.findFirst({ where: eq(coursePack.id, id) });
    if (!existing) {
      throw new Error("course pack not found");
    }
    const next = !existing.isFree;
    await this.db
      .update(coursePack)
      .set({ isFree: next, accessLevel: next ? "free" : "membership" })
      .where(eq(coursePack.id, id));
    return { id, isFree: next };
  }

  async publishCoursePack(id: string): Promise<{ id: string; status: string }> {
    const existing = await this.db.query.coursePack.findFirst({ where: eq(coursePack.id, id) });
    if (!existing) {
      throw new Error("course pack not found");
    }
    await this.db
      .update(coursePack)
      .set({ status: "published", shareLevel: "public" })
      .where(eq(coursePack.id, id));
    return { id, status: "published" };
  }
}
