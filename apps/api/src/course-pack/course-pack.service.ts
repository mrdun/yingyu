import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, ilike, or } from "drizzle-orm";

import { course, coursePack, courseRating } from "@earthworm/schema";
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

  async findFounderOnly(keyword?: string) {
    const coursePacks = await this.db.query.coursePack.findMany({
      orderBy: asc(coursePack.order),
      where: and(eq(coursePack.shareLevel, "founder_only"), keywordWhere(keyword)),
    });

    return coursePacks;
  }

  async findAllForUser(userId: string, keyword?: string) {
    const userIdOwnedCoursePacks = await this.db.query.coursePack.findMany({
      orderBy: asc(coursePack.order),
      where: and(
        eq(coursePack.creatorId, userId),
        eq(coursePack.shareLevel, "private"),
        keywordWhere(keyword),
      ),
    });

    return userIdOwnedCoursePacks;
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

  async findOne(coursePackId: string) {
    const result = await this.db.query.coursePack.findFirst({
      where: eq(coursePack.id, coursePackId),
    });

    if (!result) {
      throw new NotFoundException(`CoursePack with ID ${coursePackId} not found`);
    }

    return result;
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

  async rateCourse(
    userId: string,
    coursePackId: string,
    courseId: string,
    total: number,
    correct: number,
  ) {
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
