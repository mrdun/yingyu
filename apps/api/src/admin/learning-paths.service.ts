import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, count, eq, sql } from "drizzle-orm";

import { coursePack, learningPath, learningPathItem } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";
import { isUniqueViolationError } from "./db-errors";

/**
 * 学习路线管理端 (O-04 批次)。
 *
 * 为什么需要一组新的管理端接口:
 *  - 公开接口 (../learning-path/learning-path.service.ts) 只有 2 个只读方法, 且都强制
 *    `isPublished = true` —— 管理端既看不到自己建的未发布路线, 也没有任何写入能力;
 *  - 公开接口的可见性逻辑**不动**: 游客/会员仍然只能看到已发布的路线。
 *
 * 管理端返回的路线**不限发布状态**, 过滤条件由调用方显式传入 (isPublished)。
 * 所有列表查询都带确定性排序 `asc(order), asc(id)`: order 允许重复 (新建默认 0),
 * 单键排序在 order 相同时顺序不确定, 配 limit/offset 会翻页重复或漏行。
 */

export interface AdminLearningPathRow {
  id: string;
  title: string;
  description: string;
  cover: string | null;
  order: number;
  isPublished: boolean;
  /** 该路线下的条目数 (列表页直接展示, 不用再逐条查详情) */
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminLearningPathList {
  items: AdminLearningPathRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminLearningPathItemRow {
  id: string;
  stage: string;
  coursePackId: string;
  coursePackTitle: string;
  order: number;
}

export interface AdminLearningPathDetail extends AdminLearningPathRow {
  items: AdminLearningPathItemRow[];
}

export interface LearningPathWriteDto {
  title?: string;
  description?: string;
  cover?: string;
  order?: number;
}

export interface LearningPathItemWriteDto {
  coursePackId?: string;
  stage?: string;
  order?: number;
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

@Injectable()
export class LearningPathsAdminService {
  constructor(@Inject(DB) private db: DbType) {}

  /** GET /admin/learning-paths —— 全部路线 (含未发布), 服务端分页 + isPublished 过滤 */
  async list(params: {
    page: number;
    pageSize: number;
    isPublished?: boolean;
  }): Promise<AdminLearningPathList> {
    const { page, pageSize } = params;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (params.isPublished !== undefined) {
      conditions.push(eq(learningPath.isPublished, params.isPublished));
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await this.db
      .select({
        id: learningPath.id,
        title: learningPath.title,
        description: learningPath.description,
        cover: learningPath.cover,
        order: learningPath.order,
        isPublished: learningPath.isPublished,
        createdAt: learningPath.createdAt,
        updatedAt: learningPath.updatedAt,
        itemCount: sql<number>`count(${learningPathItem.id})`,
      })
      .from(learningPath)
      .leftJoin(learningPathItem, eq(learningPathItem.learningPathId, learningPath.id))
      .where(where)
      // learning_paths.id 是主键, group by 后可选同表其它列 (与 listCoursePacks 同一写法)
      .groupBy(learningPath.id)
      .orderBy(asc(learningPath.order), asc(learningPath.id))
      .limit(pageSize)
      .offset(offset);

    const [totalRow] = await this.db.select({ total: count() }).from(learningPath).where(where);

    return {
      items: rows.map((row) => this.presentPath(row, Number(row.itemCount) || 0)),
      total: Number(totalRow?.total ?? 0),
      page,
      pageSize,
    };
  }

  /** GET /admin/learning-paths/:id —— 详情 + 条目列表 (含课程包标题), 不存在 404 */
  async detail(id: string): Promise<AdminLearningPathDetail> {
    const path = await this.findPathOrThrow(id);
    const items = await this.listItemRows(id);

    return {
      ...this.presentPath(path, items.length),
      items,
    };
  }

  /** POST /admin/learning-paths —— 新建路线 (默认未发布, 需显式发布才对用户可见) */
  async create(dto: LearningPathWriteDto & { title: string }): Promise<AdminLearningPathRow> {
    const [created] = await this.db
      .insert(learningPath)
      .values({
        title: dto.title,
        description: dto.description ?? "",
        cover: dto.cover ?? null,
        order: dto.order ?? 0,
        isPublished: false,
      })
      .returning();

    return this.presentPath(created, 0);
  }

  /** PATCH /admin/learning-paths/:id —— 只更新传入字段 (不传的字段保持原值) */
  async update(id: string, dto: LearningPathWriteDto): Promise<AdminLearningPathRow> {
    await this.findPathOrThrow(id);

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.title !== undefined) set.title = dto.title;
    if (dto.description !== undefined) set.description = dto.description;
    if (dto.cover !== undefined) set.cover = dto.cover;
    // order=0 是合法值, 只能用 !== undefined 判断, 不能被 falsy 判断吃掉
    if (dto.order !== undefined) set.order = dto.order;

    const [updated] = await this.db
      .update(learningPath)
      .set(set)
      .where(eq(learningPath.id, id))
      .returning();

    return this.presentPath(updated, await this.countItems(id));
  }

  /**
   * PATCH /admin/learning-paths/:id/publish —— 发布 / 下架。
   * 幂等: 重复设置同一个值不会报错, 直接返回当前状态。
   */
  async setPublished(id: string, isPublished: boolean): Promise<AdminLearningPathRow> {
    await this.findPathOrThrow(id);

    const [updated] = await this.db
      .update(learningPath)
      .set({ isPublished, updatedAt: new Date() })
      .where(eq(learningPath.id, id))
      .returning();

    return this.presentPath(updated, await this.countItems(id));
  }

  /**
   * DELETE /admin/learning-paths/:id
   *
   * 必须在**同一个事务**里先删条目再删路线: learning_path_items.learning_path_id 是
   * 指向 learning_paths 的外键 (ON DELETE no action), 直接删路线会被外键拒绝 (500)。
   * 事务保证不会出现"条目删了、路线还在"或反之的中间态。
   */
  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    await this.findPathOrThrow(id);

    await this.db.transaction(async (tx) => {
      await tx.delete(learningPathItem).where(eq(learningPathItem.learningPathId, id));
      await tx.delete(learningPath).where(eq(learningPath.id, id));
    });

    return { id, deleted: true };
  }

  /**
   * POST /admin/learning-paths/:id/items —— 添加条目 (课程包 + 阶段 + 排序)。
   *
   * 重复添加同一课程包会被 unique(learning_path_id, course_pack_id) 拒绝。
   * 这里先查重给出**可读的 409**, 并发下漏过的重复由数据库约束兜底 —— 同样转成 409,
   * 不允许把驱动异常当 500 抛出去。
   */
  async addItem(
    learningPathId: string,
    dto: LearningPathItemWriteDto & { coursePackId: string },
  ): Promise<AdminLearningPathItemRow> {
    await this.findPathOrThrow(learningPathId);
    await this.findCoursePackOrThrow(dto.coursePackId);

    const existing = await this.findItemByCoursePack(learningPathId, dto.coursePackId);
    if (existing) throw this.duplicateItemError(existing.stage, Number(existing.order) || 0);

    const order = dto.order ?? (await this.nextItemOrder(learningPathId));

    try {
      const [created] = await this.db
        .insert(learningPathItem)
        .values({
          learningPathId,
          coursePackId: dto.coursePackId,
          stage: dto.stage ?? "",
          order,
        })
        .returning();

      return await this.presentItem(created.id);
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw new ConflictException(
          "该课程包已在本学习路线中, 不能重复添加。如需调整顺序或阶段, 请直接编辑已有条目。",
        );
      }
      throw error;
    }
  }

  /**
   * PATCH /admin/learning-path-items/:itemId —— 改阶段 / 排序 / 课程包。
   * 改成同路线里另一条目已使用的课程包 → 409 (不是 500)。
   */
  async updateItem(
    itemId: string,
    dto: LearningPathItemWriteDto,
  ): Promise<AdminLearningPathItemRow> {
    const item = await this.findItemOrThrow(itemId);

    if (dto.coursePackId !== undefined && dto.coursePackId !== item.coursePackId) {
      const pack = await this.findCoursePackOrThrow(dto.coursePackId);

      const clash = await this.findItemByCoursePack(item.learningPathId, dto.coursePackId);
      if (clash && clash.id !== item.id) {
        throw new ConflictException(
          `该学习路线里已经有课程包「${pack.title}」的条目 (阶段「${clash.stage ?? ""}」, ` +
            `排序 ${Number(clash.order) || 0}), 同一路线不能重复编排同一个课程包。` +
            "如需调整, 请改选其它课程包, 或先删除已有条目。",
        );
      }
    }

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.coursePackId !== undefined) set.coursePackId = dto.coursePackId;
    if (dto.stage !== undefined) set.stage = dto.stage;
    if (dto.order !== undefined) set.order = dto.order;

    try {
      await this.db.update(learningPathItem).set(set).where(eq(learningPathItem.id, itemId));
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw new ConflictException(
          "该学习路线里已经存在同一个课程包的条目, 同一路线不能重复编排同一个课程包。",
        );
      }
      throw error;
    }

    return await this.presentItem(itemId);
  }

  /** DELETE /admin/learning-path-items/:itemId —— 删除条目, 不存在 404 */
  async removeItem(itemId: string): Promise<{ id: string; deleted: boolean }> {
    await this.findItemOrThrow(itemId);
    await this.db.delete(learningPathItem).where(eq(learningPathItem.id, itemId));
    return { id: itemId, deleted: true };
  }

  /* ------------------------------- 内部工具 ------------------------------- */

  /** 条目列表: 按 asc(order), asc(id) —— 同 order 时顺序确定, 前端上移/下移不会漂 */
  private async listItemRows(learningPathId: string): Promise<AdminLearningPathItemRow[]> {
    const rows = await this.db
      .select({
        id: learningPathItem.id,
        stage: learningPathItem.stage,
        coursePackId: learningPathItem.coursePackId,
        coursePackTitle: coursePack.title,
        order: learningPathItem.order,
      })
      .from(learningPathItem)
      .innerJoin(coursePack, eq(coursePack.id, learningPathItem.coursePackId))
      .where(eq(learningPathItem.learningPathId, learningPathId))
      .orderBy(asc(learningPathItem.order), asc(learningPathItem.id));

    return rows.map((row) => ({
      id: row.id,
      stage: row.stage ?? "",
      coursePackId: row.coursePackId,
      coursePackTitle: row.coursePackTitle,
      order: Number(row.order) || 0,
    }));
  }

  private async presentItem(itemId: string): Promise<AdminLearningPathItemRow> {
    const [row] = await this.db
      .select({
        id: learningPathItem.id,
        stage: learningPathItem.stage,
        coursePackId: learningPathItem.coursePackId,
        coursePackTitle: coursePack.title,
        order: learningPathItem.order,
      })
      .from(learningPathItem)
      .innerJoin(coursePack, eq(coursePack.id, learningPathItem.coursePackId))
      .where(eq(learningPathItem.id, itemId));

    if (!row) {
      throw new NotFoundException(`LearningPathItem with ID ${itemId} not found`);
    }

    return {
      id: row.id,
      stage: row.stage ?? "",
      coursePackId: row.coursePackId,
      coursePackTitle: row.coursePackTitle,
      order: Number(row.order) || 0,
    };
  }

  private presentPath(
    row: {
      id: string;
      title: string;
      description: string | null;
      cover: string | null;
      order: number | null;
      isPublished: boolean | null;
      createdAt: Date | string | null;
      updatedAt: Date | string | null;
    },
    itemCount: number,
  ): AdminLearningPathRow {
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? "",
      cover: row.cover ?? null,
      order: Number(row.order) || 0,
      isPublished: Boolean(row.isPublished),
      itemCount,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }

  private async findPathOrThrow(id: string) {
    const path = await this.db.query.learningPath.findFirst({ where: eq(learningPath.id, id) });
    if (!path) {
      throw new NotFoundException(`LearningPath with ID ${id} not found`);
    }
    return path;
  }

  private async findItemOrThrow(itemId: string) {
    const item = await this.db.query.learningPathItem.findFirst({
      where: eq(learningPathItem.id, itemId),
    });
    if (!item) {
      throw new NotFoundException(`LearningPathItem with ID ${itemId} not found`);
    }
    return item;
  }

  private async findItemByCoursePack(learningPathId: string, coursePackId: string) {
    return await this.db.query.learningPathItem.findFirst({
      where: and(
        eq(learningPathItem.learningPathId, learningPathId),
        eq(learningPathItem.coursePackId, coursePackId),
      ),
    });
  }

  private async findCoursePackOrThrow(coursePackId: string) {
    const pack = await this.db.query.coursePack.findFirst({
      where: eq(coursePack.id, coursePackId),
    });
    if (!pack) {
      throw new NotFoundException(`CoursePack with ID ${coursePackId} not found`);
    }
    return pack;
  }

  private async countItems(learningPathId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(learningPathItem)
      .where(eq(learningPathItem.learningPathId, learningPathId));
    return Number(row?.total ?? 0);
  }

  private async nextItemOrder(learningPathId: string): Promise<number> {
    const [row] = await this.db
      .select({ max: sql<number>`coalesce(max(${learningPathItem.order}), -1)` })
      .from(learningPathItem)
      .where(eq(learningPathItem.learningPathId, learningPathId));
    return Number(row?.max ?? -1) + 1;
  }

  private duplicateItemError(stage: string | null, order: number): ConflictException {
    return new ConflictException(
      `该课程包已在本学习路线中 (阶段「${stage ?? ""}」, 排序 ${order}), 不能重复添加。` +
        "如需调整顺序或阶段, 请直接编辑已有条目。",
    );
  }
}
