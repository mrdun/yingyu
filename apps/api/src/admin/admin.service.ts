import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, count, eq, sql } from "drizzle-orm";

import {
  course,
  coursePack,
  reviewRecords,
  statement,
  userLearningActivities,
  userLearnRecord,
} from "@earthworm/schema";
import { isLegalCourseStatusTransition } from "../course-pack/course-status";
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
  status: string;
  source: string;
  accessLevel: string;
  courseCount: number;
  statementCount: number;
  createdAt: string;
  updatedAt: string;
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

  async listCoursePacks(params: {
    page: number;
    pageSize: number;
    status?: string;
    source?: string;
    accessLevel?: string;
  }): Promise<AdminCoursePackList> {
    const { page, pageSize } = params;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (params.status) conditions.push(eq(coursePack.status, params.status));
    if (params.source) conditions.push(eq(coursePack.source, params.source));
    if (params.accessLevel) conditions.push(eq(coursePack.accessLevel, params.accessLevel));
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await this.db
      .select({
        id: coursePack.id,
        title: coursePack.title,
        isFree: coursePack.isFree,
        status: coursePack.status,
        source: coursePack.source,
        accessLevel: coursePack.accessLevel,
        createdAt: coursePack.createdAt,
        updatedAt: coursePack.updatedAt,
        courseCount: sql<number>`count(distinct ${course.id})`,
        statementCount: sql<number>`count(${statement.id})`,
      })
      .from(coursePack)
      .leftJoin(course, eq(course.coursePackId, coursePack.id))
      .leftJoin(statement, eq(statement.courseId, course.id))
      .where(where)
      .groupBy(coursePack.id)
      .orderBy(coursePack.order)
      .limit(pageSize)
      .offset(offset);

    const [totalRow] = await this.db.select({ total: count() }).from(coursePack).where(where);

    return {
      coursePacks: rows.map((r) => ({
        id: r.id,
        title: r.title,
        isFree: Boolean(r.isFree),
        status: r.status,
        source: r.source,
        accessLevel: r.accessLevel,
        courseCount: Number(r.courseCount) || 0,
        statementCount: Number(r.statementCount) || 0,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
        updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : "",
      })),
      total: Number(totalRow?.total ?? 0),
      page,
      pageSize,
    };
  }

  /** 创建课程 (管理员): 永远以 draft 起步, 不能创建后直接 published。 */
  async createCoursePack(dto: {
    title: string;
    description?: string;
    cover?: string;
    accessLevel?: "free" | "membership";
  }) {
    const accessLevel = dto.accessLevel ?? "membership";
    const [pack] = await this.db
      .insert(coursePack)
      .values({
        title: dto.title,
        description: dto.description ?? "",
        cover: dto.cover ?? null,
        order: 0,
        creatorId: "admin",
        shareLevel: "private",
        status: "draft",
        source: "manual",
        accessLevel,
        isFree: accessLevel === "free",
      })
      .returning();
    return pack;
  }

  /** 编辑课程属性 (管理员): 不改动 status, 避免普通编辑导致状态意外变化。 */
  async updateCoursePack(
    id: string,
    dto: {
      title?: string;
      description?: string;
      cover?: string;
      accessLevel?: "free" | "membership";
    },
  ) {
    await this.findCoursePackOrThrow(id);

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.title !== undefined) set.title = dto.title;
    if (dto.description !== undefined) set.description = dto.description;
    if (dto.cover !== undefined) set.cover = dto.cover;
    if (dto.accessLevel !== undefined) {
      set.accessLevel = dto.accessLevel;
      set.isFree = dto.accessLevel === "free"; // 旧字段兼容同步
    }

    const [updated] = await this.db
      .update(coursePack)
      .set(set)
      .where(eq(coursePack.id, id))
      .returning();
    return updated;
  }

  /** 管理员修改课程访问属性 free <-> membership (不影响 status)。 */
  async setCoursePackAccessLevel(id: string, accessLevel: "free" | "membership") {
    await this.findCoursePackOrThrow(id);
    const [updated] = await this.db
      .update(coursePack)
      .set({ accessLevel, isFree: accessLevel === "free", updatedAt: new Date() })
      .where(eq(coursePack.id, id))
      .returning();
    return updated;
  }

  /** 兼容旧 toggle-free 语义: 取反 access_level。 */
  async toggleCoursePackFree(id: string): Promise<{ id: string; isFree: boolean }> {
    const existing = await this.findCoursePackOrThrow(id);
    const nextLevel = existing.accessLevel === "free" ? "membership" : "free";
    await this.setCoursePackAccessLevel(id, nextLevel);
    return { id, isFree: nextLevel === "free" };
  }

  async submitReview(id: string) {
    return await this.transitionCoursePackStatus(id, "review");
  }

  async rejectReview(id: string) {
    return await this.transitionCoursePackStatus(id, "draft");
  }

  async publishCoursePack(id: string) {
    const existing = await this.findCoursePackOrThrow(id);
    if (!isLegalCourseStatusTransition(existing.status, "published")) {
      throw new BadRequestException(
        `Illegal course status transition: ${existing.status} -> published`,
      );
    }
    // 发布后进入课程中心 (status=published 且 shareLevel=public)
    const [updated] = await this.db
      .update(coursePack)
      .set({ status: "published", shareLevel: "public", updatedAt: new Date() })
      .where(eq(coursePack.id, id))
      .returning();
    return updated;
  }

  async archiveCoursePack(id: string) {
    return await this.transitionCoursePackStatus(id, "archived");
  }

  async restoreCoursePack(id: string) {
    return await this.transitionCoursePackStatus(id, "draft");
  }

  /** 状态机统一入口: 校验并执行合法状态转换 (review->published 由 publish 单独处理 shareLevel)。 */
  private async transitionCoursePackStatus(id: string, to: string) {
    const existing = await this.findCoursePackOrThrow(id);
    if (!isLegalCourseStatusTransition(existing.status, to)) {
      throw new BadRequestException(
        `Illegal course status transition: ${existing.status} -> ${to}`,
      );
    }
    const [updated] = await this.db
      .update(coursePack)
      .set({ status: to, updatedAt: new Date() })
      .where(eq(coursePack.id, id))
      .returning();
    return updated;
  }

  private async findCoursePackOrThrow(id: string) {
    const pack = await this.db.query.coursePack.findFirst({ where: eq(coursePack.id, id) });
    if (!pack) {
      throw new NotFoundException(`CoursePack with ID ${id} not found`);
    }
    return pack;
  }
}
