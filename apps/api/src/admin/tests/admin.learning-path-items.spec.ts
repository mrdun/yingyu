import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { validate } from "class-validator";
import { eq } from "drizzle-orm";

import { coursePack, learningPath, learningPathItem } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { LearningPathsAdminService } from "../learning-paths.service";
import { CreateLearningPathItemDto, UpdateLearningPathItemDto } from "../dto/learning-path.dto";

/**
 * 学习路线**条目编排**的管理端接口 (O-04 批次):
 *   POST   /admin/learning-paths/:id/items     添加条目
 *   PATCH  /admin/learning-path-items/:itemId  改条目 (阶段 / 排序 / 课程包)
 *   DELETE /admin/learning-path-items/:itemId  删除条目
 *
 * 这些断言防的回归:
 *  - 重复添加同一课程包冒 500 (unique(learning_path_id, course_pack_id) 直接抛驱动异常)
 *    → 必须是可读的 409, 前端才能把原因原样展示给管理员
 *  - 改成同路线里另一条目已用的课程包同样冒 500
 *  - 条目排序不确定 (同 order 时顺序漂移 → 上移/下移看起来"没反应")
 *  - 删除不存在的条目返回 200 (前端以为删掉了)
 */

async function insertPath(db: DbType, extra?: Partial<typeof learningPath.$inferInsert>) {
  const [path] = await db
    .insert(learningPath)
    .values({ title: "新手入门", description: "", order: 0, isPublished: false, ...extra })
    .returning();
  return path;
}

async function insertPack(
  db: DbType,
  title = "课程包",
  extra?: Partial<typeof coursePack.$inferInsert>,
) {
  const [pack] = await db
    .insert(coursePack)
    .values({
      order: 0,
      title,
      creatorId: "admin",
      status: "published",
      source: "manual",
      accessLevel: "membership",
      shareLevel: "public",
      isFree: false,
      ...extra,
    })
    .returning();
  return pack;
}

describe("LearningPathsAdminService items (条目编排, O-04)", () => {
  let db: DbType;
  let service: LearningPathsAdminService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [LearningPathsAdminService],
    }).compile();
    db = module.get<DbType>(DB);
    service = module.get<LearningPathsAdminService>(LearningPathsAdminService);
  });

  beforeEach(async () => {
    await cleanDB(db);
  });

  afterAll(async () => {
    await cleanDB(db);
    await endDB();
  });

  describe("POST /admin/learning-paths/:id/items (添加条目)", () => {
    it("正常路径: 写入课程包 + 阶段 + 排序, 返回课程包标题", async () => {
      const path = await insertPath(db);
      const pack = await insertPack(db, "发音基础");

      const created = await service.addItem(path.id, {
        coursePackId: pack.id,
        stage: "入门",
        order: 2,
      });

      expect(created.coursePackId).toBe(pack.id);
      expect(created.coursePackTitle).toBe("发音基础");
      expect(created.stage).toBe("入门");
      expect(created.order).toBe(2);

      const detail = await service.detail(path.id);
      expect(detail.itemCount).toBe(1);
    });

    it("不传 order 时排在最后 (max(order)+1), 不传 stage 时为空串", async () => {
      const path = await insertPath(db);
      const first = await insertPack(db, "第一个");
      const second = await insertPack(db, "第二个");

      const a = await service.addItem(path.id, { coursePackId: first.id, order: 4 });
      const b = await service.addItem(path.id, { coursePackId: second.id });

      expect(a.order).toBe(4);
      expect(b.order).toBe(5);
      expect(b.stage).toBe("");
    });

    it("重复添加同一课程包 → 409 Conflict (可读 message, 不是 500)", async () => {
      const path = await insertPath(db);
      const pack = await insertPack(db, "发音基础");
      await service.addItem(path.id, { coursePackId: pack.id, stage: "入门" });

      const error = await service
        .addItem(path.id, { coursePackId: pack.id })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getStatus()).toBe(409);
      expect(String((error as Error).message)).toContain("不能重复添加");
      // 可读: 提示里带上已有条目的阶段/排序, 管理员不用自己猜冲突在哪
      expect(String((error as Error).message)).toContain("入门");

      // 冲突时不得写入第二条
      const rows = await db
        .select()
        .from(learningPathItem)
        .where(eq(learningPathItem.learningPathId, path.id));
      expect(rows).toHaveLength(1);
    });

    it("同一课程包可以出现在**不同**路线里 (唯一约束是路线内唯一)", async () => {
      const pathA = await insertPath(db, { title: "路线A" });
      const pathB = await insertPath(db, { title: "路线B", order: 1 });
      const pack = await insertPack(db);

      await service.addItem(pathA.id, { coursePackId: pack.id });
      const inB = await service.addItem(pathB.id, { coursePackId: pack.id });

      expect(inB.coursePackId).toBe(pack.id);
    });

    it("路线不存在 → 404; 课程包不存在 → 404", async () => {
      const path = await insertPath(db);
      const pack = await insertPack(db);

      await expect(service.addItem("not-exist", { coursePackId: pack.id })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.addItem(path.id, { coursePackId: "not-exist" })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("DTO 校验: coursePackId 必填且非空, order 非负整数", async () => {
      const dto = (partial: Record<string, unknown>) =>
        Object.assign(new CreateLearningPathItemDto(), partial);

      expect(await validate(dto({ coursePackId: "p1" }))).toHaveLength(0);
      expect(await validate(dto({ coursePackId: "p1", stage: "入门", order: 0 }))).toHaveLength(0);

      expect((await validate(dto({}))).map((e) => e.property)).toContain("coursePackId");
      expect((await validate(dto({ coursePackId: "" }))).map((e) => e.property)).toContain(
        "coursePackId",
      );
      for (const bad of [-1, 1.5]) {
        expect(
          (await validate(dto({ coursePackId: "p1", order: bad }))).map((e) => e.property),
        ).toContain("order");
      }
    });
  });

  describe("PATCH /admin/learning-path-items/:itemId (编辑条目)", () => {
    it("正常路径: 改阶段 / 排序 / 课程包 (只改传入项)", async () => {
      const path = await insertPath(db);
      const packA = await insertPack(db, "A");
      const packB = await insertPack(db, "B");
      const item = await service.addItem(path.id, {
        coursePackId: packA.id,
        stage: "入门",
        order: 1,
      });

      const restaged = await service.updateItem(item.id, { stage: "进阶" });
      expect(restaged.stage).toBe("进阶");
      expect(restaged.order).toBe(1); // 未传 order → 保持原值
      expect(restaged.coursePackId).toBe(packA.id);

      const reordered = await service.updateItem(item.id, { order: 0 });
      expect(reordered.order).toBe(0);
      expect(reordered.stage).toBe("进阶");

      const repacked = await service.updateItem(item.id, { coursePackId: packB.id });
      expect(repacked.coursePackId).toBe(packB.id);
      expect(repacked.coursePackTitle).toBe("B");
    });

    it("改成同路线里另一条目已用的课程包 → 409 Conflict (不是 500)", async () => {
      const path = await insertPath(db);
      const packA = await insertPack(db, "A");
      const packB = await insertPack(db, "B");
      const first = await service.addItem(path.id, { coursePackId: packA.id, order: 0 });
      const second = await service.addItem(path.id, { coursePackId: packB.id, order: 1 });

      const error = await service
        .updateItem(second.id, { coursePackId: packA.id })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getStatus()).toBe(409);
      expect(String((error as Error).message)).toContain("不能重复编排同一个课程包");

      // 冲突时不改任何字段 (原课程包保持不变)
      const [unchanged] = await db
        .select()
        .from(learningPathItem)
        .where(eq(learningPathItem.id, second.id));
      expect(unchanged?.coursePackId).toBe(packB.id);
      expect(first.coursePackId).toBe(packA.id);
    });

    it("把课程包改成自己原来的值不报冲突 (幂等编辑)", async () => {
      const path = await insertPath(db);
      const pack = await insertPack(db, "A");
      const item = await service.addItem(path.id, { coursePackId: pack.id });

      const same = await service.updateItem(item.id, { coursePackId: pack.id, stage: "同值" });
      expect(same.coursePackId).toBe(pack.id);
      expect(same.stage).toBe("同值");
    });

    it("条目不存在 → 404; 目标课程包不存在 → 404", async () => {
      const path = await insertPath(db);
      const pack = await insertPack(db);
      const item = await service.addItem(path.id, { coursePackId: pack.id });

      await expect(service.updateItem("not-exist", { stage: "x" })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.updateItem(item.id, { coursePackId: "not-exist" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("DTO 校验: 所有字段可选 (空 body 合法), 但传了就不能是非法值", async () => {
      const dto = (partial: Record<string, unknown>) =>
        Object.assign(new UpdateLearningPathItemDto(), partial);

      expect(await validate(dto({}))).toHaveLength(0);
      expect(await validate(dto({ stage: "入门", order: 0 }))).toHaveLength(0);

      expect((await validate(dto({ coursePackId: "" }))).map((e) => e.property)).toContain(
        "coursePackId",
      );
      for (const bad of [-1, 1.5]) {
        expect((await validate(dto({ order: bad }))).map((e) => e.property)).toContain("order");
      }
    });
  });

  describe("DELETE /admin/learning-path-items/:itemId (删除条目)", () => {
    it("正常路径: 条目被删除, 路线与其它条目不受影响", async () => {
      const path = await insertPath(db);
      const packA = await insertPack(db, "A");
      const packB = await insertPack(db, "B");
      const doomed = await service.addItem(path.id, { coursePackId: packA.id, order: 0 });
      const kept = await service.addItem(path.id, { coursePackId: packB.id, order: 1 });

      const result = await service.removeItem(doomed.id);

      expect(result).toEqual({ id: doomed.id, deleted: true });

      const detail = await service.detail(path.id);
      expect(detail.items.map((item) => item.id)).toEqual([kept.id]);
      expect(detail.itemCount).toBe(1);
    });

    it("不存在 → 404 NotFoundException (不能返回成功)", async () => {
      await expect(service.removeItem("not-exist")).rejects.toBeInstanceOf(NotFoundException);

      const error = await service.removeItem("not-exist").catch((e: unknown) => e);
      expect((error as NotFoundException).getStatus()).toBe(404);
    });
  });

  describe("条目排序确定性 (上移/下移依赖它)", () => {
    it("order 相同的条目按 asc(id) 兜底排序, 多次读取顺序一致", async () => {
      const path = await insertPath(db);
      const packs = await Promise.all(["A", "B", "C"].map((title) => insertPack(db, title)));
      for (const pack of packs) {
        // 手工录入时两条 order 可能相同 (create 显式传 order=0)
        await service.addItem(path.id, { coursePackId: pack.id, order: 0 });
      }

      const first = await service.detail(path.id);
      const second = await service.detail(path.id);

      expect(first.items.map((item) => item.id)).toEqual(second.items.map((item) => item.id));
      expect(first.items.map((item) => item.order)).toEqual([0, 0, 0]);
    });
  });
});
