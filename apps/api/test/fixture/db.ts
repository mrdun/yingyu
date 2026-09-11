import { DbType } from "src/global/providers/db.provider";

import {
  course,
  coursePack,
  learningPath,
  learningPathItem,
  pictureWord,
  statement,
  userCourseProgress,
} from "@earthworm/schema";
import { getTokenOwner } from "../../test/fixture/user";

type CoursePackInsert = typeof coursePack.$inferInsert;

export async function insertCoursePack(db: DbType, values?: Partial<CoursePackInsert>) {
  const defaultCoursePack = {
    order: 1,
    title: "课程包",
    description: "这是一个课程包",
    isFree: true,
    creatorId: "test",
    shareLevel: "public",
    status: "published",
    source: "manual",
    accessLevel: "free",
  } satisfies CoursePackInsert;

  const [entity] = await db
    .insert(coursePack)
    .values({
      ...defaultCoursePack,
      ...values,
    })
    .returning();

  return entity;
}

type CourseInsert = typeof course.$inferInsert;
export async function insertCourse(
  db: DbType,
  coursePackId: string,
  values?: Partial<CourseInsert>,
) {
  const defaultCourse = {
    order: 1,
    title: "第一课",
    coursePackId,
  } satisfies CourseInsert;

  const [entity] = await db
    .insert(course)
    .values({
      ...defaultCourse,
      ...values,
    })
    .returning();

  return entity;
}

type StatementInsert = typeof statement.$inferInsert;
export async function insertStatement(
  db: DbType,
  courseId: string,
  order: number,
  values?: Partial<StatementInsert>,
) {
  const defaultStatement = {
    order,
    courseId,
    chinese: "你好",
    english: "hello",
    soundmark: "nihao",
  } satisfies StatementInsert;

  const [entity] = await db
    .insert(statement)
    .values({
      ...defaultStatement,
      ...values,
    })
    .returning();

  return entity;
}

type LearningPathInsert = typeof learningPath.$inferInsert;
export async function insertLearningPath(db: DbType, values?: Partial<LearningPathInsert>) {
  const defaults = {
    title: "学习路线",
    order: 1,
    isPublished: true,
  } satisfies LearningPathInsert;

  const [entity] = await db
    .insert(learningPath)
    .values({
      ...defaults,
      ...values,
    })
    .returning();

  return entity;
}

type LearningPathItemInsert = typeof learningPathItem.$inferInsert;
export async function insertLearningPathItem(
  db: DbType,
  learningPathId: string,
  coursePackId: string,
  values?: Partial<LearningPathItemInsert>,
) {
  const defaults = {
    learningPathId,
    coursePackId,
    order: 1,
  } satisfies LearningPathItemInsert;

  const [entity] = await db
    .insert(learningPathItem)
    .values({
      ...defaults,
      ...values,
    })
    .returning();

  return entity;
}

type PictureWordInsert = typeof pictureWord.$inferInsert;
export async function insertPictureWord(db: DbType, values?: Partial<PictureWordInsert>) {
  const defaults = {
    word: "apple",
    chinese: "苹果",
    soundmark: "/ˈæpl/",
    imageUrl: "https://example.com/apple.jpg",
    order: 1,
  } satisfies PictureWordInsert;

  const [entity] = await db
    .insert(pictureWord)
    .values({
      ...defaults,
      ...values,
    })
    .returning();

  return entity;
}

export async function insertUserCourseProgress(
  db,
  coursePackId: string,
  courseId: string,
  statementIndex: number,
) {
  const [entity] = await db
    .insert(userCourseProgress)
    .values({
      userId: getTokenOwner(),
      coursePackId,
      courseId,
      statementIndex,
    })
    .returning();

  return entity;
}
