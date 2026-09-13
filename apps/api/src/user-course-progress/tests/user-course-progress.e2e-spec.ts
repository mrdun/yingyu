import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import * as request from "supertest";

import { userCourseProgress } from "@earthworm/schema";
import { insertUserCourseProgress } from "../../../test/fixture/db";
import { cleanDB, ensureUser, signin } from "../../../test/helper/utils";
import { AppModule } from "../../app/app.module";
import { appGlobalMiddleware } from "../../app/useGlobal";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";

describe("user-progress e2e", () => {
  let app: INestApplication;
  let db: DbType;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    appGlobalMiddleware(app);
    db = moduleFixture.get<DbType>(DB);
    await app.init();
    token = await signin(moduleFixture);
    // users 影子表在生产由登录流程写入, e2e 不经过登录, 这里显式造出该用户, 测试不依赖库内残留数据
    userId = await ensureUser(db, token);
  });

  afterEach(async () => {
    await cleanDB(db);
  });

  afterAll(async () => {
    await endDB();
    await app.close();
  });

  it("get: /user-course-progress/recent-course-packs", async () => {
    const coursePackIdFirst = createId();
    const courseIdFirst = createId();
    const coursePackIdSecond = createId();
    const courseIdSecond = createId();
    await insertUserCourseProgress(db, coursePackIdFirst, courseIdFirst, 0);
    await insertUserCourseProgress(db, coursePackIdSecond, courseIdSecond, 10);

    await request(app.getHttpServer())
      .get("/user-course-progress/recent-course-packs")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.length).toBe(2);
      });
  });

  it("put: /user-course-progress", async () => {
    const coursePackId = createId();
    const courseId = createId();
    await insertUserCourseProgress(db, coursePackId, courseId, 1);

    // 先 await 请求拿到 200, 再断言 DB (supertest 的 .expect(fn) 不会 await 异步回调,
    // 异步断言会在测试生命周期之外执行, 读库时写入/数据可能已被 cleanDB 清掉)
    await request(app.getHttpServer())
      .put("/user-course-progress")
      .send({
        courseId,
        coursePackId,
        statementIndex: 10,
      })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const result = await db.query.userCourseProgress.findFirst({
      where: and(
        eq(userCourseProgress.userId, userId),
        eq(userCourseProgress.coursePackId, coursePackId),
        eq(userCourseProgress.courseId, courseId),
      ),
    });

    expect(result).toBeTruthy();
    // 不只断言行存在, 还要断言 upsert 真的把进度写进去了
    expect(result?.statementIndex).toBe(10);
  });
});
