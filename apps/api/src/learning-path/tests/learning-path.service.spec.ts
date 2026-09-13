import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createId } from "@paralleldrive/cuid2";

import type { DbType } from "../../global/providers/db.provider";
import {
  insertCoursePack,
  insertLearningPath,
  insertLearningPathItem,
} from "../../../test/fixture/db";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB } from "../../global/providers/db.provider";
import { LearningPathService } from "../learning-path.service";

describe("LearningPathService", () => {
  let db: DbType;
  let service: LearningPathService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: testImportModules,
      providers: [LearningPathService],
    }).compile();

    db = moduleRef.get<DbType>(DB);
    service = moduleRef.get<LearningPathService>(LearningPathService);
  });

  beforeEach(async () => {
    await cleanDB(db);
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await cleanDB(db);
    await endDB();
  });

  describe("findAll", () => {
    it("只返回已发布的路线，并携带课程包数量", async () => {
      const published = await insertLearningPath(db, { title: "新手入门", isPublished: true });
      await insertLearningPath(db, { title: "草稿路线", isPublished: false });

      const coursePack = await insertCoursePack(db, {});
      await insertLearningPathItem(db, published.id, coursePack.id, {});

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("新手入门");
      expect(result[0].coursePackCount).toBe(1);
    });
  });

  describe("findOne", () => {
    it("未发布路线对游客不可见 (404, 防止草稿泄露)", async () => {
      const draft = await insertLearningPath(db, { title: "未发布路线", isPublished: false });

      await expect(service.findOne(draft.id)).rejects.toThrow(NotFoundException);
    });

    it("按顺序返回路线内的课程包", async () => {
      const path = await insertLearningPath(db, { title: "进阶路线", isPublished: true });

      const packA = await insertCoursePack(db, {});
      const packB = await insertCoursePack(db, {});

      await insertLearningPathItem(db, path.id, packA.id, { order: 1, stage: "第一阶段" });
      await insertLearningPathItem(db, path.id, packB.id, { order: 2, stage: "第二阶段" });

      const result = await service.findOne(path.id);

      expect(result.title).toBe("进阶路线");
      expect(result.items).toHaveLength(2);
      expect(result.items[0].coursePack.id).toBe(packA.id);
      expect(result.items[0].stage).toBe("第一阶段");
      expect(result.items[1].coursePack.id).toBe(packB.id);
    });

    it("路线不存在时抛出 NotFoundException", async () => {
      const fakeId = createId();
      await expect(service.findOne(fakeId)).rejects.toThrow(NotFoundException);
    });
  });
});
