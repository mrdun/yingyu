import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { validate } from "class-validator";

import { coursePack, learningPath, learningPathItem } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { LearningPathsAdminController } from "../learning-paths.controller";
import { LearningPathsAdminService } from "../learning-paths.service";
import {
  CreateLearningPathDto,
  SetLearningPathPublishedDto,
  UpdateLearningPathDto,
} from "../dto/learning-path.dto";

/**
 * 学习路线管理端 (O-04 批次) 的路线级接口:
 *   GET    /admin/learning-paths            全部路线 (含未发布) + 分页 + isPublished 过滤
 *   GET    /admin/learning-paths/:id        详情 + 条目
 *   POST   /admin/learning-paths            新建
 *   PATCH  /admin/learning-paths/:id        编辑
 *   PATCH  /admin/learning-paths/:id/publish 发布 / 下架
 *   DELETE /admin/learning-paths/:id        删除 (连带条目)
 *
 * 这些断言防的回归:
 *  - 管理端看不到自己建的未发布路线 (又变成只看 published → 后台无法编辑草稿)
 *  - order 相同时排序不确定, 分页翻页重复/漏行 (新建路线默认 order=0, 极易踩中)
 *  - 删除路线撞外键失败 (必须先删条目, 且要在同一事务里)
 */

async function insertPath(
  db: DbType,
  extra?: Partial<typeof learningPath.$inferInsert>,
): Promise<{ id: string }> {
  const [path] = await db
    .insert(learningPath)
    .values({ title: "新手入门", description: "desc", order: 0, isPublished: false, ...extra })
    .returning();
  return path;
}

async function insertPack(
  db: DbType,
  extra?: Partial<typeof coursePack.$inferInsert>,
): Promise<{ id: string; title: string }> {
  const [pack] = await db
    .insert(coursePack)
    .values({
      order: 0,
      title: "课程包",
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

async function insertItem(db: DbType, learningPathId: string, coursePackId: string, order = 0) {
  const [item] = await db
    .insert(learningPathItem)
    .values({ learningPathId, coursePackId, order, stage: "入门" })
    .returning();
  return item;
}

describe("LearningPathsAdminService (学习路线管理端, O-04)", () => {
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

  describe("GET /admin/learning-paths (列表)", () => {
    it("包含未发布路线 —— 管理端必须能看到并编辑自己的草稿", async () => {
      const published = await insertPath(db, { title: "已发布", isPublished: true });
      const draft = await insertPath(db, { title: "草稿", isPublished: false });

      const result = await service.list({ page: 1, pageSize: 20 });

      expect(result.total).toBe(2);
      expect(result.items.map((item) => item.id).sort()).toEqual([published.id, draft.id].sort());
      expect(result.items.find((item) => item.id === draft.id)?.isPublished).toBe(false);
      expect(result.items.find((item) => item.id === published.id)?.isPublished).toBe(true);
    });

    it("分页: page/pageSize 生效, total 是全量条数 (不是当前页条数)", async () => {
      for (let i = 0; i < 5; i++) {
        await insertPath(db, { title: `路线-${i}`, order: i });
      }

      const page1 = await service.list({ page: 1, pageSize: 2 });
      const page3 = await service.list({ page: 3, pageSize: 2 });

      expect(page1.total).toBe(5);
      expect(page1.page).toBe(1);
      expect(page1.pageSize).toBe(2);
      expect(page1.items.map((item) => item.order)).toEqual([0, 1]);
      expect(page3.items.map((item) => item.order)).toEqual([4]);
    });

    it("排序确定性: order 全相同 (新建默认 0) 时按 asc(id) 兜底, 翻页不重复不遗漏", async () => {
      const created: string[] = [];
      for (let i = 0; i < 6; i++) {
        const path = await insertPath(db, { title: `路线-${i}`, order: 0 });
        created.push(path.id);
      }

      const seen: string[] = [];
      for (let page = 1; page <= 3; page++) {
        const result = await service.list({ page, pageSize: 2 });
        expect(result.total).toBe(6);
        expect(result.items).toHaveLength(2);
        seen.push(...result.items.map((item) => item.id));
      }

      // 不重复: 3 页 6 行去重后仍是 6 个不同 id
      expect(new Set(seen).size).toBe(6);
      // 不遗漏: 覆盖全部 6 条路线
      expect([...seen].sort()).toEqual([...created].sort());

      // 同一页重复请求结果一致 (顺序确定, 不受 limit/offset 影响)
      const firstAgain = await service.list({ page: 1, pageSize: 2 });
      expect(firstAgain.items.map((item) => item.id)).toEqual(seen.slice(0, 2));
    });

    it("order 不同时以 order 为主键排序 (次键 id 不会顶掉业务排序)", async () => {
      const third = await insertPath(db, { title: "c", order: 2 });
      const first = await insertPath(db, { title: "a", order: 0 });
      const second = await insertPath(db, { title: "b", order: 1 });

      const page1 = await service.list({ page: 1, pageSize: 2 });
      const page2 = await service.list({ page: 2, pageSize: 2 });

      expect(page1.items.map((item) => item.id)).toEqual([first.id, second.id]);
      expect(page2.items.map((item) => item.id)).toEqual([third.id]);
    });

    it("isPublished 过滤: true 只回已发布, false 只回未发布", async () => {
      await insertPath(db, { title: "已发布", isPublished: true });
      await insertPath(db, { title: "草稿", isPublished: false });

      const published = await service.list({ page: 1, pageSize: 20, isPublished: true });
      const drafts = await service.list({ page: 1, pageSize: 20, isPublished: false });

      expect(published.total).toBe(1);
      expect(published.items[0]?.title).toBe("已发布");
      expect(drafts.total).toBe(1);
      expect(drafts.items[0]?.title).toBe("草稿");
    });

    it("每条路线含 itemCount (没有条目时是 0, 不是 null)", async () => {
      const withItems = await insertPath(db, { title: "有条目", order: 0 });
      const empty = await insertPath(db, { title: "空路线", order: 1 });
      const packA = await insertPack(db, { title: "包A" });
      const packB = await insertPack(db, { title: "包B" });
      await insertItem(db, withItems.id, packA.id, 0);
      await insertItem(db, withItems.id, packB.id, 1);

      const result = await service.list({ page: 1, pageSize: 20 });

      expect(result.items.find((item) => item.id === withItems.id)?.itemCount).toBe(2);
      expect(result.items.find((item) => item.id === empty.id)?.itemCount).toBe(0);
    });
  });

  describe("GET /admin/learning-paths/:id (详情)", () => {
    it("返回路线字段 + 条目列表, 条目含 coursePackTitle", async () => {
      const path = await insertPath(db, { title: "新手入门", order: 3, isPublished: true });
      const pack = await insertPack(db, { title: "发音基础" });
      const item = await insertItem(db, path.id, pack.id, 7);

      const detail = await service.detail(path.id);

      expect(detail.id).toBe(path.id);
      expect(detail.title).toBe("新手入门");
      expect(detail.order).toBe(3);
      expect(detail.isPublished).toBe(true);
      expect(detail.itemCount).toBe(1);
      expect(detail.items).toEqual([
        {
          id: item.id,
          stage: "入门",
          coursePackId: pack.id,
          coursePackTitle: "发音基础",
          order: 7,
        },
      ]);
    });

    it("条目按 asc(order), asc(id) 排序, 且只返回本路线的条目", async () => {
      const path = await insertPath(db, { title: "路线A" });
      const other = await insertPath(db, { title: "路线B" });
      const packA = await insertPack(db, { title: "A" });
      const packB = await insertPack(db, { title: "B" });
      const packOther = await insertPack(db, { title: "其它" });

      const late = await insertItem(db, path.id, packA.id, 5);
      const early = await insertItem(db, path.id, packB.id, 1);
      const foreign = await insertItem(db, other.id, packOther.id, 0);

      const detail = await service.detail(path.id);

      expect(detail.items.map((item) => item.id)).toEqual([early.id, late.id]);
      expect(detail.items.some((item) => item.id === foreign.id)).toBe(false);
    });

    it("不存在 → 404 NotFoundException", async () => {
      await expect(service.detail("not-exist")).rejects.toBeInstanceOf(NotFoundException);

      const error = await service.detail("not-exist").catch((e: unknown) => e);
      expect((error as NotFoundException).getStatus()).toBe(404);
    });
  });

  describe("POST /admin/learning-paths (新建)", () => {
    it("新建路线默认未发布 (不会因为新建就对用户可见)", async () => {
      const created = await service.create({ title: "新路线" });

      expect(created.title).toBe("新路线");
      expect(created.isPublished).toBe(false);
      expect(created.description).toBe("");
      expect(created.order).toBe(0);
      expect(created.itemCount).toBe(0);
    });

    it("description / cover / order 按传入值写入", async () => {
      const created = await service.create({
        title: "进阶路线",
        description: "给学完入门的人",
        cover: "/covers/adv.svg",
        order: 4,
      });

      const detail = await service.detail(created.id);
      expect(detail.description).toBe("给学完入门的人");
      expect(detail.cover).toBe("/covers/adv.svg");
      expect(detail.order).toBe(4);
      expect(detail.isPublished).toBe(false);
    });
  });

  describe("PATCH /admin/learning-paths/:id (编辑)", () => {
    it("只更新传入字段, 未传字段保持原值", async () => {
      const path = await insertPath(db, {
        title: "原名",
        description: "原描述",
        cover: "/covers/old.svg",
        order: 1,
      });

      const renamed = await service.update(path.id, { title: "新名" });
      expect(renamed.title).toBe("新名");
      expect(renamed.description).toBe("原描述");
      expect(renamed.cover).toBe("/covers/old.svg");
      expect(renamed.order).toBe(1);

      // order=0 是合法值, 不能被 falsy 判断吃掉
      const reordered = await service.update(path.id, { order: 0 });
      expect(reordered.order).toBe(0);
      expect(reordered.title).toBe("新名");
    });

    it("编辑不改发布状态 (发布只能走 publish 端点)", async () => {
      const path = await insertPath(db, { isPublished: true });
      const updated = await service.update(path.id, { title: "改标题" });
      expect(updated.isPublished).toBe(true);
    });

    it("不存在 → 404 NotFoundException", async () => {
      await expect(service.update("not-exist", { title: "x" })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("PATCH /admin/learning-paths/:id/publish (发布 / 下架)", () => {
    it("发布后 isPublished=true, 下架后 false", async () => {
      const path = await insertPath(db, { isPublished: false });

      const published = await service.setPublished(path.id, true);
      expect(published.isPublished).toBe(true);

      const unpublished = await service.setPublished(path.id, false);
      expect(unpublished.isPublished).toBe(false);
    });

    it("幂等: 重复发布/重复下架都不报错, 返回当前状态", async () => {
      const path = await insertPath(db, { isPublished: true });

      const again = await service.setPublished(path.id, true);
      const againAgain = await service.setPublished(path.id, true);

      expect(again.isPublished).toBe(true);
      expect(againAgain.isPublished).toBe(true);
      expect(againAgain.id).toBe(path.id);
    });

    it("不存在 → 404 NotFoundException", async () => {
      await expect(service.setPublished("not-exist", true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("DELETE /admin/learning-paths/:id (删除)", () => {
    it("事务内先删条目再删路线 —— 不会撞外键, 也不留孤儿条目", async () => {
      const path = await insertPath(db, { title: "待删除" });
      const keep = await insertPath(db, { title: "保留" });
      const packA = await insertPack(db, { title: "A" });
      const packB = await insertPack(db, { title: "B" });
      await insertItem(db, path.id, packA.id, 0);
      await insertItem(db, path.id, packB.id, 1);
      const keptItem = await insertItem(db, keep.id, packA.id, 0);

      const result = await service.remove(path.id);

      expect(result).toEqual({ id: path.id, deleted: true });

      // 路线没了
      const paths = await db.select().from(learningPath);
      expect(paths.map((row) => row.id)).toEqual([keep.id]);

      // 它的条目也没了 (连带删除), 其它路线的条目不受影响
      const items = await db.select().from(learningPathItem);
      expect(items.map((row) => row.id)).toEqual([keptItem.id]);
    });

    it("不存在 → 404 NotFoundException (且不会误删别人的条目)", async () => {
      await expect(service.remove("not-exist")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("DTO 校验", () => {
    function createDto(partial: Record<string, unknown>): CreateLearningPathDto {
      return Object.assign(new CreateLearningPathDto(), partial);
    }

    function updateDto(partial: Record<string, unknown>): UpdateLearningPathDto {
      return Object.assign(new UpdateLearningPathDto(), partial);
    }

    function publishDto(partial: Record<string, unknown>): SetLearningPathPublishedDto {
      return Object.assign(new SetLearningPathPublishedDto(), partial);
    }

    it("CreateLearningPathDto: title 必填且非空", async () => {
      expect(await validate(createDto({ title: "新手入门" }))).toHaveLength(0);
      expect((await validate(createDto({ title: "" }))).map((e) => e.property)).toContain("title");
      expect((await validate(createDto({}))).map((e) => e.property)).toContain("title");
    });

    it("order 一律非负整数 (与课程包/课程/语句同一套 @IsInt @Min(0))", async () => {
      expect(await validate(createDto({ title: "t", order: 0 }))).toHaveLength(0);
      expect(await validate(updateDto({ title: "t", order: 7 }))).toHaveLength(0);
      for (const bad of [-1, 1.5]) {
        expect(
          (await validate(createDto({ title: "t", order: bad }))).map((e) => e.property),
        ).toContain("order");
        expect((await validate(updateDto({ order: bad }))).map((e) => e.property)).toContain(
          "order",
        );
      }
    });

    it("UpdateLearningPathDto: 所有字段可选 (空 body 合法), title 传空串仍被拒", async () => {
      expect(await validate(updateDto({}))).toHaveLength(0);
      expect((await validate(updateDto({ title: "" }))).map((e) => e.property)).toContain("title");
    });

    it("SetLearningPathPublishedDto: isPublished 必须是布尔值", async () => {
      expect(await validate(publishDto({ isPublished: true }))).toHaveLength(0);
      expect(await validate(publishDto({ isPublished: false }))).toHaveLength(0);

      const errors = await validate(publishDto({ isPublished: "true" }));
      expect(errors.map((e) => e.property)).toContain("isPublished");
    });
  });

  describe("权限", () => {
    it("9 个端点全部要求 admin:access", () => {
      const methods = [
        "list",
        "detail",
        "create",
        "update",
        "publish",
        "remove",
        "createItem",
        "updateItem",
        "removeItem",
      ];
      for (const method of methods) {
        const permissions = Reflect.getMetadata(
          "permissions",
          (LearningPathsAdminController.prototype as any)[method],
        );
        expect(permissions).toEqual(["admin:access"]);
      }
    });
  });
});
