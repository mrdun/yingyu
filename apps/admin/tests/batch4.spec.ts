import { describe, expect, it } from "vitest";

import {
  BATCH4_PAGE_FILES,
  countOccurrences,
  fileExists,
  readSource,
} from "./helpers/admin-source";

/**
 * O-04 批次 (学习路线: 路线列表 + 条目编排) 的源码级断言。
 *
 * 这些断言防的回归:
 *  - 管理端看不到未发布路线 (列表又变成只查已发布 → 后台无法整理自己的草稿)
 *  - 用"批量排序接口"实现上移/下移 (本批次根本没有这个接口, 后端一旦没实现就是 404)
 *  - 重复编排同一课程包时前端吞掉 409 (管理员看到"已保存", 实际后端拒绝了)
 *  - 删除路线/条目没有二次确认, 或删除路线不提示会连带删除条目
 *  - 条目编排绕开 service 直接发请求 / 自己另写一套课程包取数
 *  - 页面出现"购买/会员"这类与本页语义 (编排学习顺序) 无关的文案
 */

const learningPathsPage = readSource("pages/learning-paths.vue");
const learningPathsService = readSource("services/learningPaths.service.ts");
const learningPathUtil = readSource("utils/learningPath.ts");
const itemFormModal = readSource("components/form/LearningPathItemFormModal.vue");
const pathFormModal = readSource("components/form/LearningPathFormModal.vue");
const coursesService = readSource("services/courses.service.ts");
const nav = readSource("utils/nav.ts");

describe("O-04 的学习路线页面", () => {
  it.each(BATCH4_PAGE_FILES)("%s 存在", (page) => {
    expect(fileExists(page), `${page} 应存在`).toBe(true);
  });

  it("页面只调 service: 无裸 fetch / $fetch / URL 字面量 / 绝对地址", () => {
    for (const page of BATCH4_PAGE_FILES) {
      const source = readSource(page);
      expect(source, `${page} 应显式 import service`).toContain('from "~/services/');
      expect(source, `${page} 不应出现 $fetch(`).not.toMatch(/\$fetch\(/);
      expect(source, `${page} 不应出现裸 fetch(`).not.toMatch(/(?<![\w$])fetch\(/);
      expect(source, `${page} 不应内联 /admin/ 请求路径`).not.toMatch(/["'`]\/admin\//);
      expect(source, `${page} 不应出现绝对 http(s) 地址`).not.toMatch(/https?:\/\//);
    }
  });

  it("页面走 learningPaths.service, 不跨应用 import / 不直连数据库", () => {
    expect(learningPathsPage).toContain('from "~/services/learningPaths.service"');
    for (const file of [...BATCH4_PAGE_FILES, "services/learningPaths.service.ts"]) {
      const source = readSource(file);
      for (const forbidden of ["apps/client", "drizzle", "prisma", "@earthworm/schema"]) {
        expect(source, `${file} 不应包含 ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("页面有 loading / empty / error / 分页 (列表页四态齐全)", () => {
    expect(learningPathsPage).toContain("AppLoading");
    expect(learningPathsPage).toContain("AppEmpty");
    expect(learningPathsPage).toContain("AppError");
    expect(learningPathsPage).toContain("AppPagination");
    expect(learningPathsPage).toContain("useServerPagedList");
    expect(learningPathsPage).toContain("list.reload");
  });

  it("文案只谈「编排学习顺序」, 不出现购买/会员等其它语义", () => {
    for (const forbidden of ["购买", "会员", "价格", "收费"]) {
      expect(learningPathsPage, `学习路线页不应出现「${forbidden}」`).not.toContain(forbidden);
    }
  });
});

describe("路线列表: 含未发布的路线 + 状态徽章 + 发布状态过滤", () => {
  it("service 打的是管理端列表接口, 且 isPublished 只作为显式过滤参数", () => {
    expect(learningPathsService).toContain("/admin/learning-paths");
    expect(learningPathsService).toContain("isPublished");
    // 管理端**默认**不带 isPublished (即含未发布); 只有显式选择过滤才带上
    expect(learningPathsService).toContain("if (params.isPublished !== undefined)");
  });

  it("列表展示状态徽章 / 条目数 / 排序, 并提供未发布过滤", () => {
    expect(learningPathsPage).toContain("presentLearningPathPublished");
    expect(learningPathsPage).toContain("row.itemCount");
    expect(learningPathsPage).toContain("formatCount");
    expect(learningPathsPage).toContain("LEARNING_PATH_PUBLISHED_FILTER_OPTIONS");
    expect(learningPathUtil).toContain("全部状态 (含未发布)");
    expect(learningPathUtil).toContain('{ value: "false", label: "未发布" }');
  });

  it("新建 / 编辑路线走同一条 service, 表单只提交 DTO 认的字段", () => {
    expect(learningPathsPage).toContain("createLearningPath");
    expect(learningPathsPage).toContain("updateLearningPath");
    expect(learningPathsPage).toContain("LearningPathFormModal");
    for (const field of ["title", "description", "cover", "order"]) {
      expect(pathFormModal, `路线表单应包含 ${field}`).toContain(field);
    }
    // 发布状态不随表单提交 (只能走 publish 端点)
    expect(pathFormModal).not.toContain("isPublished:");
  });
});

describe("发布 / 下架与删除: 都必须二次确认", () => {
  it("发布/下架走现有 publish 端点, 且必须二次确认", () => {
    expect(learningPathsService).toContain("/publish");
    expect(learningPathsService).toContain("setLearningPathPublished");
    expect(learningPathsPage).toContain("AppConfirmDialog");
    expect(learningPathsPage).toContain("askTogglePublish");
    expect(learningPathsPage).toContain("setLearningPathPublished");
  });

  it("删除路线是强确认: 明确提示会连带删除条目且不可撤销", () => {
    expect(learningPathsPage).toContain("askDeletePath");
    expect(learningPathsPage).toContain("deleteLearningPath");
    expect(learningPathsPage).toContain("会被一并删除");
    expect(learningPathsPage).toContain("不可撤销");
    // 提示里必须写清楚「课程包本身不会被删除」, 避免管理员误以为会删课程
    expect(learningPathsPage).toContain("课程包本身不会被删除");
  });

  it("删除条目也走二次确认", () => {
    expect(learningPathsPage).toContain("askDeleteItem");
    expect(learningPathsPage).toContain("deleteLearningPathItem");
  });

  it("后端拒绝时展示错误原文, 不做乐观更新", () => {
    expect(learningPathsPage).toContain("getErrorMessage(error)");
    expect(learningPathsPage).toContain("操作未生效 (后端拒绝)");
    expect(learningPathsPage).toContain("await refreshAll()");
    expect(learningPathsPage).not.toContain("catch {");
  });
});

describe("条目编排 (本页核心)", () => {
  it("添加条目: 课程包下拉复用既有课程包列表接口, 不新增取数", () => {
    expect(learningPathsPage).toContain("fetchCoursePackOptions");
    expect(learningPathsService).toContain("fetchCoursePackOptions");
    // 复用课程中心的既有列表函数 (import 而不是重写一套)
    expect(learningPathsService).toContain('from "./courses.service"');
    expect(learningPathsService).toContain("fetchCoursePacks({ page, pageSize })");
    expect(coursesService).toContain("adminApi.get<AdminCoursePackList>");
  });

  it("添加 / 编辑条目字段与后端 DTO 对齐 (coursePackId / stage / order)", () => {
    expect(learningPathsPage).toContain("addLearningPathItem");
    expect(learningPathsPage).toContain("updateLearningPathItem");
    for (const field of ["coursePackId", "stage", "order"]) {
      expect(itemFormModal, `条目表单应包含 ${field}`).toContain(field);
    }
    expect(itemFormModal).toContain("必须是非负整数");
    expect(itemFormModal).toContain("请选择课程包");
  });

  it("重复添加同一课程包时把后端错误原文展示给用户 (409 不吞掉、不冒 500)", () => {
    // 页面把后端 message 原文塞进表单的 error 属性
    expect(learningPathsPage).toContain("itemFormError.value = getErrorMessage(error)");
    expect(learningPathsPage).toContain(':error="itemFormError"');
    expect(itemFormModal).toContain("props.error");
    expect(itemFormModal).toContain("data-testid");
    // 冲突时弹窗保持打开 (让管理员改选), 且不提示"已保存"
    expect(learningPathsPage).toContain("itemFormOpen.value = false;");
    expect(learningPathsPage).not.toContain("catch {");
  });

  it("阶段名与排序可编辑, 排序走同一条单条 PATCH", () => {
    expect(learningPathsPage).toContain("openEditItem");
    expect(learningPathsPage).toContain("nextPathItemOrder");
    expect(learningPathUtil).toContain("export function nextPathItemOrder");
    expect(itemFormModal).toContain("阶段名");
  });
});

describe("排序: 复用既有单条 PATCH, 没有新增后端批量接口", () => {
  it("learningPaths service 里不存在任何批量/排序专用端点", () => {
    for (const forbidden of ["/reorder", "/batch", "/bulk", "/sort", "/move"]) {
      expect(learningPathsService, `learningPaths.service 不应出现 ${forbidden}`).not.toContain(
        forbidden,
      );
    }
    // 排序只可能写 order 字段, 且只命中这两条既有端点
    expect(learningPathsService).toContain("/admin/learning-path-items/${pathSegment(itemId)}");
    expect(learningPathsService).toContain(
      "/admin/learning-paths/${pathSegment(learningPathId)}/items",
    );
  });

  it("上移/下移只对相邻两条发既有 PATCH {order} (与 O-03 课程/语句同一做法)", () => {
    expect(learningPathsPage).toContain("buildOrderSwapPayloads");
    expect(learningPathsPage).toContain(
      "updateLearningPathItem(change.id, { order: change.order })",
    );
    expect(learningPathsPage).toContain("已经是第一个条目");
    expect(learningPathsPage).toContain("已经是最后一个条目");
    // 不新增任何批量接口
    expect(learningPathsPage).not.toContain("/bulk");
  });

  it("条目顺序由后端决定 (asc(order), asc(id)) —— 前端不自行重排列表", () => {
    expect(learningPathsService).not.toContain(".sort(");
    expect(learningPathsPage).not.toContain("items.value.sort(");
  });
});

describe("侧边栏「学习路线」由占位改为可用链接", () => {
  it("学习路线 → /learning-paths 且 implemented: true", () => {
    expect(nav).toContain('label: "学习路线"');
    expect(nav).toContain('to: "/learning-paths"');
    const line = nav.split(/\r?\n/).find((item) => item.includes('label: "学习路线"'));
    expect(line).toContain("implemented: true");
  });

  it("13 项全部可用, 零占位 (没有 to: null 的导航项)", () => {
    expect(countOccurrences(nav, /key: "/g)).toBe(13);
    expect(countOccurrences(nav, "implemented: true")).toBe(13);
    expect(countOccurrences(nav, "implemented: false")).toBe(0);
    expect(nav).not.toContain("to: null");
  });
});
