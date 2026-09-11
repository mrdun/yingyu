import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

import { userStatementProgress } from "@earthworm/schema";
import type { DbType } from "../../global/providers/db.provider";
import { insertCourse, insertCoursePack, insertStatement } from "../../../test/fixture/db";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { CourseHistoryService } from "../../course-history/course-history.service";
import { CourseService } from "../../course/course.service";
import { DB } from "../../global/providers/db.provider";
import { CourseAccessService } from "../course-access.service";
import { CoursePackService } from "../course-pack.service";

describe("CoursePackService", () => {
  let db: DbType;
  let coursePackService: CoursePackService;
  let courseService: CourseService;
  let mockCourseAccess: { canViewCoursePack: jest.Mock; canStudyCoursePack: jest.Mock };

  const fakeCoursePackId = createId();
  const fakeCourseId = createId();

  beforeAll(async () => {
    const testHelper = await setupTesting();
    db = testHelper.db;
    coursePackService = testHelper.coursePackService;
    courseService = testHelper.courseService;
    mockCourseAccess = testHelper.mockCourseAccess;
  });

  beforeEach(async () => {
    await cleanDB(db);
    jest.clearAllMocks();
    mockCourseAccess.canViewCoursePack.mockReturnValue(true);
    mockCourseAccess.canStudyCoursePack.mockResolvedValue(true);
  });

  afterAll(async () => {
    await cleanDB(db);
    await endDB();
  });

  describe("findAll (marketplace)", () => {
    it("returns only published + public course packs", async () => {
      const published = await insertCoursePack(db, {
        creatorId: "admin",
        shareLevel: "public",
        status: "published",
        accessLevel: "free",
      });
      await insertCoursePack(db, { creatorId: "admin", shareLevel: "public", status: "draft" });
      await insertCoursePack(db, { creatorId: "admin", shareLevel: "public", status: "review" });
      await insertCoursePack(db, { creatorId: "admin", shareLevel: "public", status: "archived" });
      await insertCoursePack(db, {
        creatorId: "admin",
        shareLevel: "private",
        status: "published",
      });
      await insertCoursePack(db, {
        creatorId: "admin",
        shareLevel: "founder_only",
        status: "published",
      });

      const result = await coursePackService.findAll("u1");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(published.id);
    });

    it("maps free/membership access level and accessible flag", async () => {
      const free = await insertCoursePack(db, { accessLevel: "free", isFree: true });
      await insertCoursePack(db, { accessLevel: "membership", isFree: false });

      mockCourseAccess.canStudyCoursePack.mockResolvedValue(false);

      const result = await coursePackService.findAll(null);

      expect(result).toHaveLength(2);
      expect(result.find((r) => r.id === free.id)?.accessLevel).toBe("free");
      expect(result.find((r) => r.id === free.id)?.isFree).toBe(true);
      expect(result.every((r) => r.accessible === false)).toBe(true);
    });

    it("filters by free / paid", async () => {
      await insertCoursePack(db, { accessLevel: "free", isFree: true });
      await insertCoursePack(db, { accessLevel: "membership", isFree: false });

      const free = await coursePackService.findAll(null, { filter: "free" });
      expect(free).toHaveLength(1);
      expect(free[0].isFree).toBe(true);

      const paid = await coursePackService.findAll(null, { filter: "paid" });
      expect(paid).toHaveLength(1);
      expect(paid[0].isFree).toBe(false);
    });
  });

  describe("findOneWithCourses (view / study)", () => {
    it("throws NotFound for a draft course pack", async () => {
      const draft = await insertCoursePack(db, { status: "draft" });
      mockCourseAccess.canViewCoursePack.mockReturnValue(false);

      await expect(coursePackService.findOneWithCourses(null, draft.id)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("returns full content for a published free course pack", async () => {
      const pack = await insertCoursePack(db, { accessLevel: "free", isFree: true });
      await insertCourse(db, pack.id);

      const result = await coursePackService.findOneWithCourses(null, pack.id);

      expect(result.accessible).toBe(true);
      expect(result.courses).toHaveLength(1);
    });

    it("returns basic info (no courses) for a guest on a membership course pack", async () => {
      const pack = await insertCoursePack(db, { accessLevel: "membership", isFree: false });
      await insertCourse(db, pack.id);
      mockCourseAccess.canStudyCoursePack.mockResolvedValue(false);

      const result = await coursePackService.findOneWithCourses(null, pack.id);

      expect(result.id).toBe(pack.id);
      expect(result.accessible).toBe(false);
      expect(result.requiresMembership).toBe(true);
      expect(result).not.toHaveProperty("courses");
    });

    it("returns full content for a member on a membership course pack", async () => {
      const pack = await insertCoursePack(db, { accessLevel: "membership", isFree: false });
      await insertCourse(db, pack.id);
      mockCourseAccess.canStudyCoursePack.mockResolvedValue(true);

      const result = await coursePackService.findOneWithCourses("m1", pack.id);

      expect(result.accessible).toBe(true);
      expect(result.courses).toHaveLength(1);
      expect(result.courses[0]).toHaveProperty("completionCount");
    });
  });

  describe("study endpoints access control", () => {
    it("throws Forbidden when a non-member studies a membership course pack", async () => {
      const pack = await insertCoursePack(db, { accessLevel: "membership", isFree: false });
      await insertCourse(db, pack.id);
      mockCourseAccess.canStudyCoursePack.mockResolvedValue(false);

      await expect(coursePackService.findCourse("u1", pack.id, fakeCourseId)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(coursePackService.findNextCourse("u1", pack.id, fakeCourseId)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(coursePackService.completeCourse("u1", pack.id, fakeCourseId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("allows a guest to study a free course pack", async () => {
      const pack = await insertCoursePack(db, { accessLevel: "free", isFree: true });
      await insertCourse(db, pack.id);

      await coursePackService.findCourse(null, pack.id, fakeCourseId);
      expect(courseService.find).toHaveBeenCalledWith(pack.id, fakeCourseId);
    });
  });

  describe("rateCourse / getRatings access control", () => {
    it("throws NotFound when rating a course that belongs to another pack (IDOR)", async () => {
      const packA = await insertCoursePack(db, { accessLevel: "free", isFree: true });
      const packB = await insertCoursePack(db, { accessLevel: "free", isFree: true });
      const courseB = await insertCourse(db, packB.id);

      await expect(coursePackService.rateCourse("u1", packA.id, courseB.id, 10, 8)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws Forbidden when a non-member rates a membership course", async () => {
      const pack = await insertCoursePack(db, { accessLevel: "membership", isFree: false });
      const c = await insertCourse(db, pack.id);
      mockCourseAccess.canStudyCoursePack.mockResolvedValue(false);

      await expect(coursePackService.rateCourse("u1", pack.id, c.id, 10, 8)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("records a rating for an accessible course", async () => {
      const pack = await insertCoursePack(db, { accessLevel: "free", isFree: true });
      const c = await insertCourse(db, pack.id);

      const result = await coursePackService.rateCourse("u1", pack.id, c.id, 10, 8);
      expect(result.scoreRate).toBe(80);
    });

    it("throws NotFound for getRatings on a non-existent pack", async () => {
      await expect(coursePackService.getRatings("u1", createId())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("statement completion / progress", () => {
    it("records a statement completion once (idempotent)", async () => {
      const pack = await insertCoursePack(db, { accessLevel: "free", isFree: true });
      const c = await insertCourse(db, pack.id);
      const s = await insertStatement(db, c.id, 0);

      await coursePackService.completeStatement("u1", c.id, s.id);
      await coursePackService.completeStatement("u1", c.id, s.id);

      const rows = await db.query.userStatementProgress.findMany({
        where: eq(userStatementProgress.userId, "u1"),
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].statementId).toBe(s.id);
    });

    it("computes course pack progress from statement completions", async () => {
      const pack = await insertCoursePack(db, { accessLevel: "free", isFree: true });
      const c1 = await insertCourse(db, pack.id);
      const c2 = await insertCourse(db, pack.id);
      const s1 = await insertStatement(db, c1.id, 0);
      const s2 = await insertStatement(db, c1.id, 1);
      const s3 = await insertStatement(db, c2.id, 0);

      await coursePackService.completeStatement("u1", c1.id, s1.id);
      await coursePackService.completeStatement("u1", c1.id, s2.id);

      const result = await coursePackService.getProgress("u1", pack.id);
      expect(result.totalCourses).toBe(2);
      expect(result.completedCourses).toBe(1); // c1 全部完成, c2 未完成
      expect(result.progress).toBe(50);

      await coursePackService.completeStatement("u1", c2.id, s3.id);
      const done = await coursePackService.getProgress("u1", pack.id);
      expect(done.completedCourses).toBe(2);
      expect(done.progress).toBe(100);
    });

    it("rejects completing a statement that does not belong to the course (IDOR)", async () => {
      const pack = await insertCoursePack(db, { accessLevel: "free", isFree: true });
      const c1 = await insertCourse(db, pack.id);
      const c2 = await insertCourse(db, pack.id);
      const foreignStatement = await insertStatement(db, c2.id, 0);

      await expect(
        coursePackService.completeStatement("u1", c1.id, foreignStatement.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects a non-member completing a membership course statement", async () => {
      const pack = await insertCoursePack(db, { accessLevel: "membership", isFree: false });
      const c = await insertCourse(db, pack.id);
      const s = await insertStatement(db, c.id, 0);
      mockCourseAccess.canStudyCoursePack.mockResolvedValue(false);

      await expect(coursePackService.completeStatement("u1", c.id, s.id)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});

async function setupTesting() {
  const mockCourseAccess = {
    canViewCoursePack: jest.fn(() => true),
    canStudyCoursePack: jest.fn(async () => true),
  };

  const MockCourseService = {
    findWithUserProgress: jest.fn(),
    find: jest.fn(),
    findNext: jest.fn(),
    completeCourse: jest.fn(),
  };

  const MockCourseHistoryService = {
    findCompletionCount: jest.fn(() => 1),
  };

  const moduleRef = await Test.createTestingModule({
    imports: testImportModules,
    providers: [
      CoursePackService,
      { provide: CourseService, useValue: MockCourseService },
      { provide: CourseHistoryService, useValue: MockCourseHistoryService },
      { provide: CourseAccessService, useValue: mockCourseAccess },
    ],
  }).compile();

  return {
    moduleRef,
    courseService: moduleRef.get<CourseService>(CourseService),
    coursePackService: moduleRef.get<CoursePackService>(CoursePackService),
    mockCourseAccess,
    db: moduleRef.get<DbType>(DB),
  };
}
