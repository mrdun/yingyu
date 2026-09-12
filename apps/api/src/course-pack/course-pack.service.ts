import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";

import {
  course,
  coursePack,
  courseRating,
  statement,
  userCourseProgress,
  userStatementProgress,
} from "@earthworm/schema";
import { CourseHistoryService } from "../course-history/course-history.service";
import { CourseService } from "../course/course.service";
import { DB, DbType } from "../global/providers/db.provider";
import { CourseAccessService } from "./course-access.service";
import { calcGrade, calcScoreRate, isBetterScore } from "./rating";

@Injectable()
export class CoursePackService {
  constructor(
    @Inject(DB) private db: DbType,
    private readonly courseService: CourseService,
    private readonly courseHistoryService: CourseHistoryService,
    private readonly courseAccessService: CourseAccessService,
  ) {}

  async findAll(userId?: string, options?: { keyword?: string; filter?: string }) {
    const publicCoursePacks = await this.findAllPublicCoursePacks(options?.keyword);
    const result = [];
    for (const pack of publicCoursePacks) {
      const accessLevel = resolveAccessLevel(pack);
      result.push({
        id: pack.id,
        title: pack.title,
        description: pack.description,
        cover: pack.cover,
        isFree: accessLevel === "free",
        accessLevel,
        accessible: await this.courseAccessService.canStudyCoursePack(userId ?? null, pack),
      });
    }

    return applyFilter(result, options?.filter);
  }

  async findAllPublicCoursePacks(keyword?: string) {
    return await this.db.query.coursePack.findMany({
      orderBy: asc(coursePack.order),
      where: and(
        eq(coursePack.shareLevel, "public"),
        eq(coursePack.status, "published"),
        keywordWhere(keyword),
      ),
    });
  }

  /**
   * 课程详情: 统一入口做 view / study 分离。
   * - draft/review/archived → 404;
   * - free → 完整内容;
   * - membership → 游客/非会员只返回基本信息 (requiresMembership=true), 会员返回完整内容。
   */
  async findOneWithCourses(userId: string | null, coursePackId: string) {
    const pack = await this.db.query.coursePack.findFirst({
      where: eq(coursePack.id, coursePackId),
      with: {
        courses: {
          orderBy: asc(course.order),
        },
      },
    });

    if (!pack) {
      throw new NotFoundException(`CoursePack with ID ${coursePackId} not found`);
    }

    if (!this.courseAccessService.canViewCoursePack(pack)) {
      throw new NotFoundException(`CoursePack with ID ${coursePackId} not found`);
    }

    const accessLevel = resolveAccessLevel(pack);
    const canStudy = await this.courseAccessService.canStudyCoursePack(userId, pack);

    if (!canStudy) {
      return {
        id: pack.id,
        title: pack.title,
        description: pack.description,
        cover: pack.cover,
        isFree: accessLevel === "free",
        accessLevel,
        accessible: false,
        requiresMembership: accessLevel === "membership",
      };
    }

    const result: any = {
      ...pack,
      isFree: accessLevel === "free",
      accessLevel,
      accessible: true,
    };

    if (userId) {
      result.courses = await this.addCompletionCountsToCourses(
        userId,
        result.courses,
        coursePackId,
      );
    }

    return result;
  }

  /** 学习内容访问统一入口: 校验用户是否有权进入该课程包的学习内容 */
  private async assertCanStudy(userId: string | null, coursePackId: string) {
    const pack = await this.db.query.coursePack.findFirst({
      where: eq(coursePack.id, coursePackId),
    });
    if (!pack) {
      throw new NotFoundException(`CoursePack with ID ${coursePackId} not found`);
    }
    const canStudy = await this.courseAccessService.canStudyCoursePack(userId, pack);
    if (!canStudy) {
      throw new ForbiddenException("This course requires an active membership");
    }
  }

  private async addCompletionCountsToCourses(userId: string, courses: any[], coursePackId: string) {
    return await Promise.all(
      courses.map(async (course) => {
        const completionCount = await this.courseHistoryService.findCompletionCount(
          userId,
          coursePackId,
          course.id,
        );
        return {
          ...course,
          completionCount,
        };
      }),
    );
  }

  async findCourse(userId: string | null, coursePackId: string, courseId: string) {
    await this.assertCanStudy(userId, coursePackId);
    if (userId) {
      return await this.courseService.findWithUserProgress(coursePackId, courseId, userId);
    } else {
      return await this.courseService.find(coursePackId, courseId);
    }
  }

  async findNextCourse(userId: string | null, coursePackId: string, courseId: string) {
    await this.assertCanStudy(userId, coursePackId);
    return await this.courseService.findNext(coursePackId, courseId);
  }

  async completeCourse(userId: string, coursePackId: string, courseId: string) {
    await this.assertCanStudy(userId, coursePackId);
    return await this.courseService.completeCourse(userId, coursePackId, courseId);
  }

  /**
   * 记录用户完成某个 Statement (学习最小单位)。
   * 校验: statement 属于 course、course 属于 coursePack、用户有学习权限。
   * 事务保证 statement progress 与 user_course_progress 最后位置一致。
   */
  async completeStatement(userId: string, courseId: string, statementId: string) {
    const stmt = await this.db.query.statement.findFirst({
      where: and(eq(statement.id, statementId), eq(statement.courseId, courseId)),
    });
    if (!stmt) {
      throw new NotFoundException(
        `Statement with ID ${statementId} not found in course ${courseId}`,
      );
    }

    const courseEntity = await this.db.query.course.findFirst({
      where: eq(course.id, courseId),
    });
    if (!courseEntity) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    await this.assertCanStudy(userId, courseEntity.coursePackId);

    await this.db.transaction(async (tx) => {
      await tx
        .insert(userStatementProgress)
        .values({ userId, statementId, status: "completed" })
        .onConflictDoNothing({
          target: [userStatementProgress.userId, userStatementProgress.statementId],
        });

      await tx
        .insert(userCourseProgress)
        .values({
          userId,
          coursePackId: courseEntity.coursePackId,
          courseId,
          statementIndex: stmt.order,
        })
        .onConflictDoUpdate({
          target: [userCourseProgress.userId, userCourseProgress.coursePackId],
          set: { courseId, statementIndex: stmt.order },
        });
    });

    return { statementId, completed: true };
  }

  /**
   * 课程包学习进度: totalCourses / completedCourses / progress。
   * Course 完成 = 该 Course 下所有 Statement 均已完成。
   */
  async getProgress(userId: string, coursePackId: string) {
    await this.assertCanStudy(userId, coursePackId);

    // 单次聚合查询: 每个 course 的 total / completed statements (避免 N+1)
    const rows = await this.db
      .select({
        courseId: course.id,
        totalStatements: sql<number>`count(${statement.id})`,
        completedStatements: sql<number>`count(${userStatementProgress.id})`,
      })
      .from(course)
      .leftJoin(statement, eq(statement.courseId, course.id))
      .leftJoin(
        userStatementProgress,
        and(
          eq(userStatementProgress.statementId, statement.id),
          eq(userStatementProgress.userId, userId),
        ),
      )
      .where(eq(course.coursePackId, coursePackId))
      .groupBy(course.id);

    const totalCourses = rows.length;
    let completedCourses = 0;
    for (const r of rows) {
      const total = Number(r.totalStatements);
      const done = Number(r.completedStatements);
      if (total > 0 && done >= total) completedCourses++;
    }

    const progress = totalCourses === 0 ? 0 : Math.round((completedCourses / totalCourses) * 100);

    const last = await this.db.query.userCourseProgress.findFirst({
      where: and(
        eq(userCourseProgress.userId, userId),
        eq(userCourseProgress.coursePackId, coursePackId),
      ),
    });

    return {
      totalCourses,
      completedCourses,
      progress,
      lastCourseId: last?.courseId ?? null,
      lastStatementIndex: last?.statementIndex ?? 0,
    };
  }

  async rateCourse(
    userId: string,
    coursePackId: string,
    courseId: string,
    total: number,
    correct: number,
  ) {
    // 防 IDOR + 访问控制: 先确认用户可学习该课程包, 且该课程属于该课程包
    await this.assertCanStudy(userId, coursePackId);
    const courseEntity = await this.db.query.course.findFirst({
      where: and(eq(course.id, courseId), eq(course.coursePackId, coursePackId)),
    });
    if (!courseEntity) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    const scoreRate = calcScoreRate(correct, total);
    const grade = calcGrade(scoreRate);

    const existing = await this.db.query.courseRating.findFirst({
      where: and(
        eq(courseRating.userId, userId),
        eq(courseRating.coursePackId, coursePackId),
        eq(courseRating.courseId, courseId),
      ),
    });

    const isBest = isBetterScore(scoreRate, existing?.scoreRate);

    if (!existing) {
      await this.db.insert(courseRating).values({
        userId,
        coursePackId,
        courseId,
        scoreRate,
        grade,
      });
    } else if (isBest) {
      await this.db
        .update(courseRating)
        .set({ scoreRate, grade })
        .where(eq(courseRating.id, existing.id));
    }

    // 无论本次是否刷新最佳, 返回的都是历史最高评级
    const best = isBest
      ? { scoreRate, grade }
      : { scoreRate: existing!.scoreRate, grade: existing!.grade };

    return {
      scoreRate: best.scoreRate,
      grade: best.grade,
      isBest,
    };
  }

  async getRatings(userId: string, coursePackId: string) {
    const pack = await this.db.query.coursePack.findFirst({
      where: eq(coursePack.id, coursePackId),
    });
    if (!pack) {
      throw new NotFoundException(`CoursePack with ID ${coursePackId} not found`);
    }

    return await this.db
      .select({
        courseId: courseRating.courseId,
        scoreRate: courseRating.scoreRate,
        grade: courseRating.grade,
        updatedAt: courseRating.updatedAt,
      })
      .from(courseRating)
      .where(and(eq(courseRating.userId, userId), eq(courseRating.coursePackId, coursePackId)));
  }
}

function keywordWhere(keyword?: string) {
  if (!keyword?.trim()) return undefined;

  const pattern = `%${keyword.trim()}%`;
  return or(ilike(coursePack.title, pattern), ilike(coursePack.description, pattern));
}

function resolveAccessLevel(pack: { accessLevel: string | null; isFree: boolean | null }) {
  return (pack.accessLevel ?? (pack.isFree ? "free" : "membership")) as "free" | "membership";
}

function applyFilter<T extends { isFree: boolean | null }>(result: T[], filter?: string): T[] {
  if (!filter || filter === "all") return result;
  if (filter === "free") return result.filter((item) => item.isFree);
  if (filter === "paid") return result.filter((item) => !item.isFree);
  return result;
}
