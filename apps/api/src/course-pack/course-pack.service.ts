import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, ilike, or } from "drizzle-orm";

import { course, coursePack, courseRating } from "@earthworm/schema";
import { CourseHistoryService } from "../course-history/course-history.service";
import { CourseService } from "../course/course.service";
import { DB, DbType } from "../global/providers/db.provider";
import { MembershipService } from "../membership/membership.service";
import { CourseAccessService } from "./course-access.service";
import { calcGrade, calcScoreRate, isBetterScore } from "./rating";

@Injectable()
export class CoursePackService {
  constructor(
    @Inject(DB) private db: DbType,
    private readonly courseService: CourseService,
    private readonly courseHistoryService: CourseHistoryService,
    private readonly membershipService: MembershipService,
    private readonly courseAccessService: CourseAccessService,
  ) {}

  async findAll(userId?: string, options?: { keyword?: string; filter?: string }) {
    let result = [];

    const publicCoursePacks = await this.findAllPublicCoursePacks(options?.keyword);
    result.push(...publicCoursePacks);

    if (userId) {
      const userIdOwnedCoursePacks = await this.findAllForUser(userId, options?.keyword);
      result.push(...userIdOwnedCoursePacks);

      // 看看是不是创始会员
      // 是的话 需要去查所有课程包的 shareLevel 为 founder_only 的
      if (await this.membershipService.isFounderMembership(userId)) {
        const founderOnlyCoursePacks = await this.findFounderOnly(options?.keyword);
        result.push(...founderOnlyCoursePacks);
      }
    }

    result = applyFilter(result, options?.filter);

    return result;
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

  async findOneWithCourses(userId: string, coursePackId: string) {
    const coursePackWithCourses = await this.findCoursePackWithCourses(coursePackId, userId);

    if (userId) {
      coursePackWithCourses.courses = await this.addCompletionCountsToCourses(
        userId,
        coursePackWithCourses.courses,
        coursePackId,
      );
    }

    return coursePackWithCourses;
  }

  private async findCoursePackWithCourses(coursePackId: string, userId: string) {
    const coursePackWithCourses = await this.db.query.coursePack.findFirst({
      where: and(eq(coursePack.id, coursePackId)),
      with: {
        courses: {
          orderBy: asc(course.order),
        },
      },
    });

    if (!coursePackWithCourses) {
      throw new NotFoundException(`CoursePack with ID ${coursePackId} not found`);
    }

    if (coursePackWithCourses.shareLevel === "private") {
      if (coursePackWithCourses.creatorId === userId) {
        return coursePackWithCourses;
      } else {
        throw new NotFoundException(`CoursePack with ID ${coursePackId} not found`);
      }
    } else if (coursePackWithCourses.shareLevel === "founder_only") {
      if (await this.membershipService.isFounderMembership(userId)) {
        return coursePackWithCourses;
      } else {
        throw new NotFoundException(`CoursePack with ID ${coursePackId} not found`);
      }
    } else {
      const canAccess = await this.courseAccessService.canAccess(userId, coursePackWithCourses);
      if (!canAccess) {
        throw new NotFoundException(`CoursePack with ID ${coursePackId} not found`);
      }
      return coursePackWithCourses;
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

  async findCourse(userId: string, coursePackId: string, courseId: string) {
    if (userId) {
      return await this.courseService.findWithUserProgress(coursePackId, courseId, userId);
    } else {
      return await this.courseService.find(coursePackId, courseId);
    }
  }

  async findNextCourse(coursePackId: string, courseId: string) {
    return await this.courseService.findNext(coursePackId, courseId);
  }

  async completeCourse(userId: string, coursePackId: string, courseId: string) {
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

function applyFilter(
  result: { isFree: boolean | null }[],
  filter?: string,
): { isFree: boolean | null }[] {
  if (!filter || filter === "all") return result;
  if (filter === "free") return result.filter((item) => item.isFree);
  if (filter === "paid") return result.filter((item) => !item.isFree);
  return result;
}
