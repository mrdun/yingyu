import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";

import {
  course,
  courseHistory,
  coursePack,
  courseRating,
  reviewRecords,
  statement,
  userCourseProgress,
  userLearningActivities,
  userLearnRecord,
  userStatementProgress,
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

/** GET /admin/course-packs/:id 里的课程行 (不含语句正文, 只给数量) */
export interface AdminCoursePackCourseRow {
  id: string;
  title: string;
  description: string;
  video: string;
  order: number;
  statementCount: number;
  createdAt: string;
  updatedAt: string;
}

/** GET /admin/course-packs/:id —— 管理端课程包详情 (不限状态) */
export interface AdminCoursePackDetail {
  id: string;
  title: string;
  description: string;
  cover: string | null;
  status: string;
  source: string;
  accessLevel: string;
  isFree: boolean;
  order: number;
  shareLevel: string;
  createdAt: string;
  updatedAt: string;
  courses: AdminCoursePackCourseRow[];
}

/** GET /admin/courses/:courseId/statements 单项 */
export interface AdminStatementRow {
  id: string;
  chinese: string;
  english: string;
  soundmark: string;
  sourceType: string;
  audioUrl: string | null;
  startMs: number | null;
  endMs: number | null;
  order: number;
}

/** GET /admin/courses/:courseId/statements 响应 */
export interface AdminStatementList {
  items: AdminStatementRow[];
  total: number;
  page: number;
  pageSize: number;
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

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

  /**
   * 用户总数。Logto Management API 的 GET /api/users 返回的是**数组**,
   * 没有 totalCount 字段; 真实总数在响应头 `total-number` 里 (字符串)。
   */
  private async countUsers(): Promise<number> {
    try {
      const { users, total } = await this.fetchLogtoUsers({
        page: 1,
        page_size: 1,
        include_default_role: true,
      });

      if (total !== null) return total;

      // 响应头缺失: 不伪装成 0, 降级为当前页条数 (下界), 并留下 warn 便于发现
      this.logger.warn(
        `Logto 用户总数响应头 total-number 缺失, 已降级为当前页条数: page=1 page_size=1 currentPageCount=${users.length}`,
      );
      return users.length;
    } catch (error) {
      // 不静默吞掉失败: 记录原因后降级为 0, 可通过日志与"真的是 0 个用户"区分
      this.logger.warn(
        `获取 Logto 用户总数失败, 已降级为 0: ${(error as Error)?.message ?? String(error)}`,
      );
      return 0;
    }
  }

  /**
   * 拉取一页 Logto 用户。返回 total 为 null 表示响应头缺失 (由调用方决定如何降级)。
   */
  private async fetchLogtoUsers(params: Record<string, unknown>): Promise<{
    users: Array<{ id: string; username: string | null; createdAt: string | null }>;
    total: number | null;
  }> {
    const response = await this.logtoService.logtoApi.get("/api/users", { params });

    const rawUsers = Array.isArray(response.data) ? response.data : [];
    const users = rawUsers.map((u: any) => ({
      id: u?.id,
      username: u?.username ?? null,
      createdAt: u?.createdAt ?? null,
    }));

    const headers = response.headers as unknown as Record<string, unknown> | undefined;
    return { users, total: this.parseTotalNumberHeader(headers?.["total-number"]) };
  }

  /**
   * 解析响应头 total-number (字符串)。无法解析时返回 null, 让"取不到"与"真的是 0"可区分。
   */
  private parseTotalNumberHeader(value: unknown): number | null {
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw !== "string" && typeof raw !== "number") return null;

    const text = String(raw).trim();
    if (text === "") return null;

    const parsed = Number(text);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.trunc(parsed);
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
      const fetched = await this.fetchLogtoUsers({
        page,
        page_size: pageSize,
        include_default_role: true,
        ...(keyword ? { search: keyword } : {}),
      });
      logtoUsers = fetched.users;
      // 与 countUsers 同源: 总数在响应头 total-number, 缺失时降级为当前页条数
      total = fetched.total ?? fetched.users.length;
      if (fetched.total === null) {
        this.logger.warn(
          `Logto 用户总数响应头 total-number 缺失, 列表 total 已降级为当前页条数: page=${page} page_size=${pageSize} currentPageCount=${fetched.users.length}`,
        );
      }
    } catch (error) {
      // Logto 不可用时仍返回空列表 (保持接口契约), 但记录原因便于排查
      this.logger.warn(
        `获取 Logto 用户列表失败, 已降级为空列表: ${(error as Error)?.message ?? String(error)}`,
      );
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
      // 新建包一律 order=0 (createCoursePack / AI 建课), 单键排序在 order 重复时顺序不确定,
      // 配合 limit/offset 会翻页重复或漏行 —— id 兜底保证全序 (与 listCourseStatements 同一写法)
      .orderBy(asc(coursePack.order), asc(coursePack.id))
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

  /**
   * 管理端课程包详情 (只读, **不限状态**)。
   *
   * 为什么必须由管理端提供: 公开接口 (course-pack.service) 对 membership 包直接抛
   * ForbiddenException, 且只暴露 published 内容 —— 管理端连自己刚建的草稿都读不回来,
   * 课程中心就无法编辑草稿/待审/已归档的包。
   *
   * 返回: 包字段 + courses (按 order 升序, 含每课 statementCount)。
   * 刻意**不**在这一层返回语句正文: 一个包可能有上千条语句, 详情接口会被响应体撑爆;
   * 语句按课程分页读 (见 listCourseStatements)。
   */
  async getCoursePackDetail(id: string): Promise<AdminCoursePackDetail> {
    const [pack] = await this.db
      .select({
        id: coursePack.id,
        title: coursePack.title,
        description: coursePack.description,
        cover: coursePack.cover,
        status: coursePack.status,
        source: coursePack.source,
        accessLevel: coursePack.accessLevel,
        isFree: coursePack.isFree,
        order: coursePack.order,
        shareLevel: coursePack.shareLevel,
        createdAt: coursePack.createdAt,
        updatedAt: coursePack.updatedAt,
      })
      .from(coursePack)
      .where(eq(coursePack.id, id));

    if (!pack) {
      // 与其它管理端查询一致: 不存在给 404, 不返回空对象 (前端会把空对象当成"存在但无数据")
      throw new NotFoundException(`CoursePack with ID ${id} not found`);
    }

    const courseRows = await this.db
      .select({
        id: course.id,
        title: course.title,
        description: course.description,
        video: course.video,
        order: course.order,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
        statementCount: count(statement.id),
      })
      .from(course)
      .leftJoin(statement, eq(statement.courseId, course.id))
      .where(eq(course.coursePackId, id))
      // course.id 是主键, group by 后可选同表其它列 (与 listCoursePacks 同一写法)
      .groupBy(course.id)
      .orderBy(asc(course.order), asc(course.id));

    return {
      id: pack.id,
      title: pack.title,
      description: pack.description ?? "",
      cover: pack.cover ?? null,
      status: pack.status,
      source: pack.source,
      accessLevel: pack.accessLevel,
      isFree: Boolean(pack.isFree),
      order: Number(pack.order) || 0,
      shareLevel: pack.shareLevel ?? "private",
      createdAt: pack.createdAt ? new Date(pack.createdAt).toISOString() : "",
      updatedAt: pack.updatedAt ? new Date(pack.updatedAt).toISOString() : "",
      courses: courseRows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description ?? "",
        video: row.video ?? "",
        order: Number(row.order) || 0,
        statementCount: Number(row.statementCount) || 0,
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : "",
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : "",
      })),
    };
  }

  /**
   * 某课程下的语句列表 (只读, 按 order 升序, 服务端分页)。
   *
   * 管理端原本没有任何语句读取方法: 公开接口只暴露 published + public 的内容,
   * 草稿里的语句在后台无法核对, 语句编辑器因此没法工作。
   */
  async listCourseStatements(
    courseId: string,
    params: { page: number; pageSize: number },
  ): Promise<AdminStatementList> {
    // 课程不存在 → 404 (与单条查询同一语义, 不返回空列表冒充"这门课没有语句")
    await this.findCourseOrThrow(courseId);

    const { page, pageSize } = params;
    const offset = (page - 1) * pageSize;

    const rows = await this.db
      .select({
        id: statement.id,
        chinese: statement.chinese,
        english: statement.english,
        soundmark: statement.soundmark,
        sourceType: statement.sourceType,
        audioUrl: statement.audioUrl,
        startMs: statement.startMs,
        endMs: statement.endMs,
        order: statement.order,
      })
      .from(statement)
      .where(eq(statement.courseId, courseId))
      // order 允许重复 (手工录入), 同 order 时用 id 兜底保证翻页不重不漏
      .orderBy(asc(statement.order), asc(statement.id))
      .limit(pageSize)
      .offset(offset);

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(statement)
      .where(eq(statement.courseId, courseId));

    return {
      items: rows.map((row) => ({
        id: row.id,
        chinese: row.chinese,
        english: row.english,
        soundmark: row.soundmark,
        sourceType: row.sourceType ?? "text",
        audioUrl: row.audioUrl ?? null,
        startMs: row.startMs === null ? null : Number(row.startMs),
        endMs: row.endMs === null ? null : Number(row.endMs),
        order: Number(row.order) || 0,
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
      order?: number;
      accessLevel?: "free" | "membership";
    },
  ) {
    await this.findCoursePackOrThrow(id);

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.title !== undefined) set.title = dto.title;
    if (dto.description !== undefined) set.description = dto.description;
    if (dto.cover !== undefined) set.cover = dto.cover;
    if (dto.order !== undefined) set.order = dto.order; // 只在传入时改排序, 不覆盖为 undefined
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

  // ---------------------------------------------------------------------------
  // Course / Statement 内容结构管理 (核心学习内容)
  // 规则: draft 可编辑; review/published 编辑后自动退回 draft 重新审核; archived 拒绝。
  // ---------------------------------------------------------------------------

  async createCourse(
    coursePackId: string,
    dto: { title: string; description?: string; video?: string; order?: number },
  ) {
    const pack = await this.findCoursePackOrThrow(coursePackId);
    this.assertContentEditable(pack);

    const order = dto.order ?? (await this.nextCourseOrder(coursePackId));
    const [created] = await this.db
      .insert(course)
      .values({
        coursePackId,
        title: dto.title,
        description: dto.description ?? "",
        video: dto.video ?? "",
        order,
      })
      .returning();

    await this.markContentDirty(pack);
    return created;
  }

  async updateCourse(
    courseId: string,
    dto: { title?: string; description?: string; video?: string; order?: number },
  ) {
    const courseEntity = await this.findCourseOrThrow(courseId);
    const pack = await this.findCoursePackOrThrow(courseEntity.coursePackId);
    this.assertContentEditable(pack);

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.title !== undefined) set.title = dto.title;
    if (dto.description !== undefined) set.description = dto.description;
    if (dto.video !== undefined) set.video = dto.video;
    if (dto.order !== undefined) set.order = dto.order;

    const [updated] = await this.db
      .update(course)
      .set(set)
      .where(eq(course.id, courseId))
      .returning();
    await this.markContentDirty(pack);
    return updated;
  }

  async deleteCourse(courseId: string) {
    const courseEntity = await this.findCourseOrThrow(courseId);
    const pack = await this.findCoursePackOrThrow(courseEntity.coursePackId);
    this.assertContentDeletable(pack);

    await this.db.transaction(async (tx) => {
      const statementIds = await tx
        .select({ id: statement.id })
        .from(statement)
        .where(eq(statement.courseId, courseId));
      if (statementIds.length > 0) {
        await tx.delete(userStatementProgress).where(
          inArray(
            userStatementProgress.statementId,
            statementIds.map((s) => s.id),
          ),
        );
        await tx.delete(reviewRecords).where(
          inArray(
            reviewRecords.statementId,
            statementIds.map((s) => s.id),
          ),
        );
        await tx.delete(statement).where(eq(statement.courseId, courseId));
      }
      // 无 FK 的学习/评分数据: 显式清理, 避免孤儿
      await tx.delete(courseHistory).where(eq(courseHistory.courseId, courseId));
      await tx.delete(userCourseProgress).where(eq(userCourseProgress.courseId, courseId));
      await tx.delete(courseRating).where(eq(courseRating.courseId, courseId));
      await tx.delete(course).where(eq(course.id, courseId));
    });

    return { id: courseId, deleted: true };
  }

  async createStatement(
    courseId: string,
    dto: {
      chinese: string;
      english: string;
      soundmark?: string;
      sourceType?: string;
      audioUrl?: string;
      startMs?: number;
      endMs?: number;
      order?: number;
    },
  ) {
    const courseEntity = await this.findCourseOrThrow(courseId);
    const pack = await this.findCoursePackOrThrow(courseEntity.coursePackId);
    this.assertContentEditable(pack);

    const order = dto.order ?? (await this.nextStatementOrder(courseId));
    const [created] = await this.db
      .insert(statement)
      .values({
        courseId,
        order,
        chinese: dto.chinese,
        english: dto.english,
        soundmark: dto.soundmark ?? "",
        sourceType: dto.sourceType ?? "text",
        audioUrl: dto.audioUrl,
        startMs: dto.startMs,
        endMs: dto.endMs,
      })
      .returning();

    await this.markContentDirty(pack);
    return created;
  }

  async updateStatement(
    statementId: string,
    dto: {
      chinese?: string;
      english?: string;
      soundmark?: string;
      sourceType?: string;
      audioUrl?: string;
      startMs?: number;
      endMs?: number;
      order?: number;
    },
  ) {
    const stmt = await this.findStatementOrThrow(statementId);
    const courseEntity = await this.findCourseOrThrow(stmt.courseId);
    const pack = await this.findCoursePackOrThrow(courseEntity.coursePackId);
    this.assertContentEditable(pack);

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.chinese !== undefined) set.chinese = dto.chinese;
    if (dto.english !== undefined) set.english = dto.english;
    if (dto.soundmark !== undefined) set.soundmark = dto.soundmark;
    if (dto.sourceType !== undefined) set.sourceType = dto.sourceType;
    if (dto.audioUrl !== undefined) set.audioUrl = dto.audioUrl;
    if (dto.startMs !== undefined) set.startMs = dto.startMs;
    if (dto.endMs !== undefined) set.endMs = dto.endMs;
    if (dto.order !== undefined) set.order = dto.order;

    const [updated] = await this.db
      .update(statement)
      .set(set)
      .where(eq(statement.id, statementId))
      .returning();
    await this.markContentDirty(pack);
    return updated;
  }

  async deleteStatement(statementId: string) {
    const stmt = await this.findStatementOrThrow(statementId);
    const courseEntity = await this.findCourseOrThrow(stmt.courseId);
    const pack = await this.findCoursePackOrThrow(courseEntity.coursePackId);
    this.assertContentDeletable(pack);

    await this.db.transaction(async (tx) => {
      await tx
        .delete(userStatementProgress)
        .where(eq(userStatementProgress.statementId, statementId));
      await tx.delete(reviewRecords).where(eq(reviewRecords.statementId, statementId));
      await tx.delete(statement).where(eq(statement.id, statementId));
    });

    return { id: statementId, deleted: true };
  }

  /** 核心内容编辑仅在 draft/review/published 允许 (archived 拒绝); 非 draft 会自动退回 draft。 */
  private assertContentEditable(pack: { status: string }) {
    if (pack.status === "archived") {
      throw new BadRequestException(
        "Archived course pack content cannot be edited directly; restore it first",
      );
    }
  }

  /** 删除仅允许 draft/review, published/archived 拒绝 (保护历史学习数据)。 */
  private assertContentDeletable(pack: { status: string }) {
    if (pack.status !== "draft" && pack.status !== "review") {
      throw new BadRequestException(
        `Only draft/review course content can be deleted (current: ${pack.status})`,
      );
    }
  }

  /** 核心内容发生变更后, 使 review/published 退回 draft, 要求重新审核发布。 */
  private async markContentDirty(pack: { id: string; status: string }) {
    if (pack.status === "draft") return;
    await this.db
      .update(coursePack)
      .set({ status: "draft", shareLevel: "private", updatedAt: new Date() })
      .where(eq(coursePack.id, pack.id));
  }

  private async nextCourseOrder(coursePackId: string): Promise<number> {
    const [row] = await this.db
      .select({ max: sql<number>`coalesce(max(${course.order}), -1)` })
      .from(course)
      .where(eq(course.coursePackId, coursePackId));
    return Number(row?.max ?? -1) + 1;
  }

  private async nextStatementOrder(courseId: string): Promise<number> {
    const [row] = await this.db
      .select({ max: sql<number>`coalesce(max(${statement.order}), -1)` })
      .from(statement)
      .where(eq(statement.courseId, courseId));
    return Number(row?.max ?? -1) + 1;
  }

  private async findCourseOrThrow(courseId: string) {
    const courseEntity = await this.db.query.course.findFirst({
      where: eq(course.id, courseId),
    });
    if (!courseEntity) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }
    return courseEntity;
  }

  private async findStatementOrThrow(statementId: string) {
    const stmt = await this.db.query.statement.findFirst({
      where: eq(statement.id, statementId),
    });
    if (!stmt) {
      throw new NotFoundException(`Statement with ID ${statementId} not found`);
    }
    return stmt;
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
