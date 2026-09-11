import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createId } from "@paralleldrive/cuid2";

import type { DbType } from "../../global/providers/db.provider";
import { insertCourse, insertCoursePack, insertStatement } from "../../../test/fixture/db";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { CourseHistoryService } from "../../course-history/course-history.service";
import { DB } from "../../global/providers/db.provider";
import { RankService } from "../../rank/rank.service";
import { UserCourseProgressService } from "../../user-course-progress/user-course-progress.service";
import { CourseService } from "../course.service";

describe("course service", () => {
  let db: DbType;
  let courseService: CourseService;
  let rankService: RankService;
  let courseHistoryService: CourseHistoryService;
  let userCourseProgressService: UserCourseProgressService;

  beforeAll(async () => {
    const testHelper = await setupTesting();
    await setupDatabaseData(testHelper.db);

    db = testHelper.db;
    courseService = testHelper.courseService;
    rankService = testHelper.rankService;
    courseHistoryService = testHelper.courseHistoryService;
    userCourseProgressService = testHelper.UserCourseProgressService;
  });
  beforeEach(async () => {
    await cleanDB(db);
  });

  afterAll(async () => {
    await cleanDB(db);
    await endDB();
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  describe("find", () => {
    it("should return a course with the given coursePackId and courseId", async () => {
      const { coursePackId, courseEntityFirst } = await setupDBData(db);

      const result = await courseService.find(coursePackId, courseEntityFirst.id);

      expect(result).toHaveProperty("coursePackId");
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("order");
      expect(result).toHaveProperty("title");
      expect(result).toHaveProperty("statements");
    });

    it("should throw NotFoundException if the course does not exist", async () => {
      await expect(courseService.find(createId(), createId())).rejects.toThrow(NotFoundException);
    });
  });

  describe("findWithUserProgress", () => {
    it("should return a course with user progress information", async () => {
      const { coursePackId, courseEntityFirst, userId } = await setupDBData(db);

      const result = await courseService.findWithUserProgress(
        coursePackId,
        courseEntityFirst.id,
        userId,
      );

      expect(result).toHaveProperty("statementIndex");
    });
  });

  describe("findNext", () => {
    it("should return the next course", async () => {
      const { coursePackId, courseEntityFirst, courseEntitySecond } = await setupDBData(db);

      const result = await courseService.findNext(coursePackId, courseEntityFirst.id);

      expect(result).toEqual(courseEntitySecond);
    });

    it("should throw NotFoundException if there is no next course", async () => {
      const { coursePackId, courseEntitySecond } = await setupDBData(db);

      await expect(courseService.findNext(coursePackId, courseEntitySecond.id)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw NotFoundException when the course does not belong to the pack (IDOR)", async () => {
      const { coursePackId, courseEntityFirst } = await setupDBData(db);
      const otherPack = await insertCoursePack(db, { title: "other pack" });
      const foreignCourse = await insertCourse(db, otherPack.id, { title: "foreign", order: 0 });

      await expect(courseService.findNext(coursePackId, foreignCourse.id)).rejects.toThrow(
        NotFoundException,
      );
      // 原始课程仍在自己的 pack 中正常工作
      await expect(
        courseService.findNext(coursePackId, courseEntityFirst.id),
      ).resolves.toBeTruthy();
    });
  });

  describe("upsertUserLearnRecord", () => {
    it("should insert a record for today with the given count", async () => {
      await courseService.upsertUserLearnRecord("cxr", 5);

      const rows = await db.query.userLearnRecord.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ userId: "cxr", count: 5 });
      expect(String(rows[0].day)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should accumulate count when upserting the same userId+day again", async () => {
      await courseService.upsertUserLearnRecord("cxr", 3);
      await courseService.upsertUserLearnRecord("cxr", 4);

      const rows = await db.query.userLearnRecord.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].count).toBe(7);
    });

    it("should keep different users in separate rows", async () => {
      await courseService.upsertUserLearnRecord("user-a", 2);
      await courseService.upsertUserLearnRecord("user-b", 6);

      const rows = await db.query.userLearnRecord.findMany();
      expect(rows).toHaveLength(2);
      const counts = rows.map((r) => r.count).sort();
      expect(counts).toEqual([2, 6]);
    });

    it("should ignore zero or negative counts", async () => {
      await courseService.upsertUserLearnRecord("cxr", 0);
      await courseService.upsertUserLearnRecord("cxr", -1);

      const rows = await db.query.userLearnRecord.findMany();
      expect(rows).toHaveLength(0);
    });

    it("should record learned statements when completing a course", async () => {
      const { userId, courseEntityFirst, coursePackId } = await setupDBData(db);

      await courseService.completeCourse(userId, coursePackId, courseEntityFirst.id);

      const rows = await db.query.userLearnRecord.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ userId, count: 2 }); // 该课程有 2 个 statements
    });
  });

  describe("completeCourse", () => {
    it("should perform actions to complete a course for a user with userId and return the next course", async () => {
      const { userId, courseEntityFirst, coursePackId } = await setupDBData(db);

      const result = await courseService.completeCourse(userId, coursePackId, courseEntityFirst.id);

      expect(result).toHaveProperty("nextCourse");
      expect(rankService.userFinishCourse).toHaveBeenCalled();
      expect(courseHistoryService.upsert).toHaveBeenCalled();
      expect(userCourseProgressService.upsert).toHaveBeenCalled();
    });

    it("should perform actions to complete a course and return the next course when have not userId", async () => {
      const { courseEntityFirst, coursePackId } = await setupDBData(db);

      const result = await courseService.completeCourse("", coursePackId, courseEntityFirst.id);

      expect(result).toHaveProperty("nextCourse");
      expect(rankService.userFinishCourse).not.toHaveBeenCalled();
      expect(courseHistoryService.upsert).not.toHaveBeenCalled();
      expect(userCourseProgressService.upsert).not.toHaveBeenCalled();
    });

    it("should not have nextCourse when not exist next course", async () => {
      const { courseEntitySecond, coursePackId } = await setupDBData(db);

      const result = await courseService.completeCourse("", coursePackId, courseEntitySecond.id);

      expect(result.nextCourse).toBeUndefined();
    });

    it("should throw NotFoundException when the course does not belong to the pack (IDOR)", async () => {
      const { coursePackId } = await setupDBData(db);
      const otherPack = await insertCoursePack(db, { title: "other" });
      const foreignCourse = await insertCourse(db, otherPack.id, { title: "foreign", order: 0 });

      await expect(
        courseService.completeCourse("cxr", coursePackId, foreignCourse.id),
      ).rejects.toThrow(NotFoundException);
      expect(rankService.userFinishCourse).not.toHaveBeenCalled();
      expect(courseHistoryService.upsert).not.toHaveBeenCalled();
    });
  });
});

async function setupDatabaseData(db: DbType) {
  await cleanDB(db);
}

async function setupTesting() {
  const mockRankService = {
    userFinishCourse: jest.fn(),
  };
  const mockCourseHistoryService = {
    upsert: jest.fn(),
  };
  const mockUserLearnRecordService = {
    upsert: jest.fn(),
  };

  const mockUserCourseProgressService = {
    upsert: jest.fn(),
    findStatement: () => 1,
  };

  const moduleRef = await Test.createTestingModule({
    imports: testImportModules,
    providers: [
      CourseService,
      { provide: RankService, useValue: mockRankService },
      { provide: CourseHistoryService, useValue: mockCourseHistoryService },
      { provide: UserCourseProgressService, useValue: mockUserCourseProgressService },
    ],
  }).compile();

  return {
    courseService: moduleRef.get<CourseService>(CourseService),
    UserCourseProgressService: moduleRef.get<UserCourseProgressService>(UserCourseProgressService),
    rankService: moduleRef.get<RankService>(RankService),
    courseHistoryService: moduleRef.get<CourseHistoryService>(CourseHistoryService),
    db: moduleRef.get<DbType>(DB),
    moduleRef,
  };
}

async function setupDBData(db: DbType) {
  const userId = "cxr";
  const coursePackEntity = await insertCoursePack(db);
  const courseEntityFirst = await insertCourse(db, coursePackEntity.id, {
    title: "第一课",
    order: 1,
  });
  const courseEntitySecond = await insertCourse(db, coursePackEntity.id, {
    title: "第二课",
    order: 2,
  });
  const statementEntityFirst = await insertStatement(db, courseEntityFirst.id, 1);
  const statementEntitySecond = await insertStatement(db, courseEntityFirst.id, 2);

  return {
    userId,
    coursePackId: coursePackEntity.id,
    courseEntityFirst,
    courseEntitySecond,
    statementEntityFirst,
    statementEntitySecond,
  };
}
