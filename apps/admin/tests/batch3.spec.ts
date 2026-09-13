import { describe, expect, it } from "vitest";

import {
  BATCH3_PAGE_FILES,
  countOccurrences,
  fileExists,
  readSource,
} from "./helpers/admin-source";

/**
 * O-03 批次 (课程中心: 课程包列表 / 详情 / 语句编辑器 / AI 生成) 的源码级断言。
 *
 * 这些断言防的回归:
 *  - 页面绕开 service 层直接发请求 (将来换 BFF 要满地改)
 *  - 前端自建第二套课程状态机 (与后端 isLegalCourseStatusTransition 不一致 → 出现"点了没反应"
 *    或"以为发布了其实没发布"); 后端拒绝被吞掉、或者前端乐观改写本地状态
 *  - AI 生成入口被加出"直接发布"这种绕过审核的路径 (AI 内容必须是草稿 + 人工审核)
 *  - 语句编辑器丢掉素材类型/时间轴校验 (音频语句没有起止时间 → 用户端无法定位)
 *  - 用"批量排序接口"实现排序 (本批次根本没有这个接口, 后端一旦没实现就是 404)
 */

const coursesListPage = readSource("pages/courses/index.vue");
const courseDetailPage = readSource("pages/courses/[id].vue");
const statementEditorPage = readSource("pages/courses/[id]/courses/[courseId].vue");
const aiPage = readSource("pages/courses/ai.vue");

const coursesService = readSource("services/courses.service.ts");
const aiService = readSource("services/aiContent.service.ts");
const actionsComposable = readSource("composables/useCoursePackActions.ts");
const courseStatusUtil = readSource("utils/courseStatus.ts");
const statementFormUtil = readSource("utils/statementForm.ts");
const reorderUtil = readSource("utils/reorder.ts");
const audioUtil = readSource("utils/audio.ts");
const nav = readSource("utils/nav.ts");

describe("O-03 的 4 个页面", () => {
  it.each(BATCH3_PAGE_FILES)("%s 存在", (page) => {
    expect(fileExists(page), `${page} 应存在`).toBe(true);
  });

  it("每个页面都通过 services/*.service.ts 取数, 页面内无裸 fetch / $fetch / URL 字面量", () => {
    for (const page of BATCH3_PAGE_FILES) {
      const source = readSource(page);
      expect(source, `${page} 应显式 import service`).toContain('from "~/services/');
      expect(source, `${page} 不应出现 $fetch(`).not.toMatch(/\$fetch\(/);
      expect(source, `${page} 不应出现裸 fetch(`).not.toMatch(/(?<![\w$])fetch\(/);
      expect(source, `${page} 不应内联 /admin/ 请求路径`).not.toMatch(/["'`]\/admin\//);
      expect(source, `${page} 不应出现绝对 http(s) 地址`).not.toMatch(/https?:\/\//);
    }
  });

  it("4 个页面分别走对应的模块 service", () => {
    expect(coursesListPage).toContain('from "~/services/courses.service"');
    expect(courseDetailPage).toContain('from "~/services/courses.service"');
    expect(statementEditorPage).toContain('from "~/services/courses.service"');
    expect(aiPage).toContain('from "~/services/aiContent.service"');
  });

  it("每个页面都有 loading / error 状态 (列表页另有 empty + 分页)", () => {
    for (const page of BATCH3_PAGE_FILES) {
      const source = readSource(page);
      expect(source, `${page} 应有 AppLoading`).toContain("AppLoading");
      expect(source, `${page} 应有 AppError`).toContain("AppError");
      expect(source, `${page} 应有 AppEmpty`).toContain("AppEmpty");
    }
    for (const page of ["pages/courses/index.vue", "pages/courses/[id]/courses/[courseId].vue"]) {
      const source = readSource(page);
      expect(source, `${page} 应有分页`).toContain("AppPagination");
      expect(source, `${page} 应使用服务端分页状态机`).toContain("useServerPagedList");
    }
  });

  it("不跨应用 import / 不直连数据库", () => {
    const files = [
      ...BATCH3_PAGE_FILES,
      "services/courses.service.ts",
      "services/aiContent.service.ts",
    ];
    for (const file of files) {
      const source = readSource(file);
      for (const forbidden of ["apps/client", "drizzle", "prisma", "@earthworm/schema"]) {
        expect(source, `${file} 不应包含 ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

describe("课程包列表页 (课程中心入口)", () => {
  it("展示标题 / 状态 / 来源 / 访问级别 / 课程数 / 更新时间", () => {
    for (const token of [
      "pack.title",
      "presentCoursePackStatus",
      "presentCoursePackSource",
      "presentCourseAccessLevel",
      "pack.courseCount",
      "formatDateTime",
    ]) {
      expect(coursesListPage, `课程包列表应展示 ${token}`).toContain(token);
    }
  });

  it("过滤: status / source / accessLevel 走服务端, 关键词明确标注只在当前页过滤", () => {
    for (const token of ["statusFilter", "sourceFilter", "accessLevelFilter", "keyword"]) {
      expect(coursesListPage, `课程包列表应有 ${token}`).toContain(token);
    }
    expect(coursesListPage).toContain("list.reload");
    expect(coursesListPage).toContain("关键词只过滤当前页");
    expect(coursesService).toContain("accessLevel");
  });

  it("新建课程包走服务层, 并说明新建后是草稿 + 手工来源", () => {
    expect(coursesListPage).toContain("createCoursePack");
    expect(coursesListPage).toContain("CoursePackFormModal");
    expect(coursesService).toContain("adminApi.post<AdminCoursePackRow>");
  });
});

describe("课程包状态机: 5 个动作只调既有端点, 不在前端自建转换逻辑", () => {
  const STATUS_ENDPOINTS = ["/submit-review", "/reject", "/publish", "/archive", "/restore"];
  const STATUS_SERVICE_FNS = [
    "submitCoursePackReview",
    "rejectCoursePackReview",
    "publishCoursePack",
    "archiveCoursePack",
    "restoreCoursePack",
  ];

  it("service 层提供 5 个状态端点 (没有第 6 个, 也没有批量端点)", () => {
    for (const endpoint of STATUS_ENDPOINTS) {
      expect(coursesService, `courses.service 应包含 ${endpoint}`).toContain(endpoint);
    }
    expect(coursesService).not.toContain("/bulk");
  });

  it("5 个动作各绑定一个 service 函数 (动作 → 端点映射)", () => {
    expect(actionsComposable).toContain("ACTION_HANDLERS");
    for (const fn of STATUS_SERVICE_FNS) {
      expect(actionsComposable, `动作分发应包含 ${fn}`).toContain(fn);
    }
  });

  it("列表页与详情页共用同一个动作分发, 不各自写一套转换表", () => {
    for (const page of [coursesListPage, courseDetailPage]) {
      expect(page).toContain("useCoursePackActions");
      expect(page).toContain("askStatusAction");
      expect(page).toContain("availableCoursePackActions");
      for (const fn of STATUS_SERVICE_FNS) {
        expect(page, `页面不应直接调用 ${fn}`).not.toContain(fn);
      }
    }
  });

  it("可用动作由 utils/courseStatus.ts 的显示映射决定, 未知状态不猜", () => {
    expect(courseStatusUtil).toContain("STATUS_ACTIONS");
    expect(courseStatusUtil).toContain("availableCoursePackActions");
    expect(courseStatusUtil).toContain(
      "return actions.map((action) => COURSE_PACK_ACTION_META[action])",
    );
    expect(courseStatusUtil).toContain("不是第二套状态机");
  });

  it("后端拒绝时展示错误原文, 不做乐观更新 (失败也重新对齐后端状态)", () => {
    expect(actionsComposable).toContain("getErrorMessage(error)");
    expect(actionsComposable).toContain("操作未生效");
    expect(actionsComposable).toContain("await options.onSuccess()");
    // 不允许"吞掉错误"的写法
    expect(actionsComposable).not.toContain("catch {");
  });
});

describe("访问级别与免费/收费切换", () => {
  it("两个切换都走既有端点且都必须二次确认", () => {
    expect(coursesService).toContain("/access-level");
    expect(coursesService).toContain("/toggle-free");
    expect(actionsComposable).toContain("setCoursePackAccessLevel");
    expect(actionsComposable).toContain("toggleCoursePackFree");
    expect(actionsComposable).toContain("askAccessLevel");
    expect(actionsComposable).toContain("askToggleFree");
    expect(coursesListPage).toContain("AppConfirmDialog");
    expect(coursesListPage).toContain("askAccessLevel");
    expect(coursesListPage).toContain("askToggleFree");
  });
});

describe("课程包详情页", () => {
  it("用本批次新增的只读详情接口 (不限状态), 且接口确实是新加的", () => {
    expect(coursesService).toContain("fetchCoursePackDetail");
    expect(coursesService).toContain("/admin/course-packs/${pathSegment(id)}");
    expect(courseDetailPage).toContain("fetchCoursePackDetail");
  });

  it("展示包信息与状态/来源徽章, 并支持编辑 title/description/cover", () => {
    for (const token of [
      "presentCoursePackStatus",
      "presentCoursePackSource",
      "presentCourseAccessLevel",
      "updateCoursePack",
      "CoursePackFormModal",
      "pack.description",
      "pack.cover",
    ]) {
      expect(courseDetailPage, `详情页应包含 ${token}`).toContain(token);
    }
  });

  it("course pack order 可编辑: 提交走同一条 PATCH, 没有新增批量排序接口", () => {
    // 类型层面: 课程包可写字段与后端 UpdateCoursePackDto 对齐, 含 order
    const types = readSource("types/admin.ts");
    const start = types.indexOf("export interface AdminCoursePackWritePayload");
    const packPayloadType = types.slice(start, types.indexOf("}", start) + 1);
    expect(packPayloadType).toContain("accessLevel");
    expect(packPayloadType).toContain("order");

    // 详情页把表单提交的 order 放进 PATCH body (仅在传入时携带, 与 service 的
    // "dto.order !== undefined 才 set" 语义一致)
    expect(courseDetailPage).toContain("submit.payload.order");
    expect(courseDetailPage).toContain("updateCoursePack");

    // 「后端不接受 order」的缺口文案与只读输入框都已移除, 不再有"看着能改其实改不了"的字段
    const packModal = readSource("components/form/CoursePackFormModal.vue");
    for (const source of [courseStatusUtil, courseDetailPage, packModal]) {
      expect(source).not.toContain("COURSE_PACK_ORDER_GAP_NOTICE");
    }
    // 原来的只读输入框 (readonly + disabled 展示) 已改成可编辑字段
    expect(packModal).not.toContain("readonly");
    // 表单层校验与后端 DTO (@IsInt @Min(0)) 对齐
    expect(packModal).toContain("必须是非负整数");
  });

  it("课程列表支持新增 / 编辑 / 删除(二次确认) / 排序", () => {
    expect(courseDetailPage).toContain("createCourse");
    expect(courseDetailPage).toContain("updateCourse");
    expect(courseDetailPage).toContain("deleteCourse");
    expect(courseDetailPage).toContain("askDeleteCourse");
    expect(courseDetailPage).toContain("moveCourse");
    expect(courseDetailPage).toContain("CourseFormModal");
  });

  it("AI 来源的包显示「需审核后发布」, 不提供绕过审核的快捷发布", () => {
    expect(courseDetailPage).toContain("isAiGenerated");
    expect(courseDetailPage).toContain('source === "ai"');
    expect(courseDetailPage).toContain("AI 生成，需审核后发布");
    expect(courseDetailPage).toContain("跳过审核");
    expect(courseDetailPage).not.toContain("直接发布");
  });
});

describe("语句编辑器", () => {
  it("用本批次新增的语句列表接口 (分页), 字段覆盖 chinese/english/soundmark/sourceType/audioUrl/时间轴/order", () => {
    expect(coursesService).toContain("fetchCourseStatementsPage");
    expect(coursesService).toContain("/statements");
    expect(statementEditorPage).toContain("fetchCourseStatementsPage");
    for (const field of [
      "chinese",
      "english",
      "soundmark",
      "sourceType",
      "audioUrl",
      "startMs",
      "endMs",
      "order",
    ]) {
      expect(statementFormUtil, `语句表单应覆盖 ${field}`).toContain(field);
    }
  });

  it("含 3 种 sourceType, 且只有 audio 才强制要求音频与时间轴", () => {
    for (const value of ["text", "audio", "video"]) {
      expect(statementFormUtil, `sourceType 应支持 ${value}`).toContain(`value: "${value}"`);
    }
    expect(statementFormUtil).toContain('const isAudio = values.sourceType === "audio"');
    const statementFormModal = readSource("components/form/StatementFormModal.vue");
    expect(statementFormModal).toContain("STATEMENT_SOURCE_TYPES");
    expect(statementFormModal).toContain("sourceType");
    expect(statementEditorPage).toContain("StatementFormModal");
  });

  it("时间轴校验: 非负整数 + endMs 必须大于 startMs", () => {
    expect(statementFormUtil).toContain("必须是非负整数");
    expect(statementFormUtil).toContain("必须大于 startMs");
    expect(statementFormUtil).toContain("parseNonNegativeInteger");
    // 校验只在表单层: service 不做业务校验
    expect(coursesService).not.toContain("必须大于 startMs");
  });

  it("新增 / 编辑 / 删除(二次确认) 都走 service", () => {
    expect(statementEditorPage).toContain("createStatement");
    expect(statementEditorPage).toContain("updateStatement");
    expect(statementEditorPage).toContain("deleteStatement");
    expect(statementEditorPage).toContain("askDelete");
    expect(statementEditorPage).toContain("AppConfirmDialog");
    expect(statementEditorPage).toContain("不可撤销");
  });
});

describe("排序: 复用既有单条 PATCH, 没有新增后端接口", () => {
  it("courses service 里不存在任何批量/排序专用端点", () => {
    for (const forbidden of ["/reorder", "/batch", "/bulk", "/sort", "/move"]) {
      expect(coursesService, `courses.service 不应出现 ${forbidden}`).not.toContain(forbidden);
    }
    // 排序只可能写 order 字段
    expect(reorderUtil).toContain("PATCH /admin/courses/:courseId");
    expect(reorderUtil).toContain("PATCH /admin/statements/:statementId");
  });

  it("上移/下移只对相邻两条发既有 PATCH {order}", () => {
    expect(reorderUtil).toContain("buildOrderSwapPayloads");
    expect(courseDetailPage).toContain("buildOrderSwapPayloads");
    expect(statementEditorPage).toContain("buildOrderSwapPayloads");
    expect(courseDetailPage).toContain("updateCourse(change.id, { order: change.order })");
    expect(statementEditorPage).toContain("updateStatement(change.id, { order: change.order })");
  });

  it("语句/课程的 order 也可以直接数字编辑 (同一条 PATCH)", () => {
    expect(readSource("components/form/StatementFormModal.vue")).toContain("order");
    expect(readSource("components/form/CourseFormModal.vue")).toContain("order");
    expect(coursesService).toContain("AdminCourseWritePayload");
    expect(coursesService).toContain("AdminStatementWritePayload");
  });
});

describe("AI 生成入口 (/courses/ai)", () => {
  it("固定说明: AI 内容一律为草稿 + 来源 AI, 必须审核后发布, 不能直接对外可见", () => {
    expect(aiPage).toContain("AI 生成的内容一律为草稿");
    expect(aiPage).toContain("草稿");
    expect(aiPage).toContain("AI");
    expect(aiPage).toContain("审核");
    expect(aiPage).toContain("不能直接对外可见");
    expect(aiPage).toContain("ai-draft-notice");
  });

  it("四个入口都在, 且字段按后端 DTO (title/description/text/subtitle/audioBase64/mimeType/courseSize)", () => {
    for (const fn of [
      "splitStatements",
      "createAiCoursePackFromText",
      "createAiCoursePackFromSubtitle",
      "createAiCoursePackFromAudio",
    ]) {
      expect(aiPage, `AI 页应包含 ${fn}`).toContain(fn);
    }
    const dtoFields = [
      "title",
      "description",
      "text",
      "subtitle",
      "audioBase64",
      "mimeType",
      "courseSize",
    ];
    for (const field of dtoFields) {
      expect(aiPage, `AI 页表单应包含 ${field}`).toContain(field);
    }
  });

  it("没有直接发布路径: 不出现发布/提交审核的服务函数或端点", () => {
    for (const forbidden of [
      "publishCoursePack",
      "submitCoursePackReview",
      "archiveCoursePack",
      "/publish",
      "/submit-review",
      "adminApi",
      "/admin/",
    ]) {
      expect(aiPage, `AI 页不应出现 ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("生成成功后只提示「已生成草稿课程包（AI）」并跳到该草稿详情页", () => {
    expect(aiPage).toContain("已生成草稿课程包");
    expect(aiPage).toContain("navigateTo(`/courses/${result.coursePackId}`)");
  });

  it("音频用纯 base64 提交 (去掉 dataURL 前缀), 大文件给出提示而不是静默失败", () => {
    expect(aiPage).toContain("toAudioPayload");
    expect(aiPage).toContain("audioWarning");
    expect(audioUtil).toContain("stripDataUrlPrefix");
    expect(audioUtil).toContain("readAsDataURL");
    expect(audioUtil).toContain("AUDIO_WARN_BYTES");
    expect(audioUtil).toContain("AUDIO_MAX_BYTES");
    expect(audioUtil).toContain("不做静默截断");
  });

  it("aiContent service 只有 4 个既有端点, 不含任何发布入口", () => {
    for (const endpoint of [
      "/ai-content/split",
      "/ai-content/course-pack",
      "/ai-content/subtitle",
      "/ai-content/audio",
    ]) {
      expect(aiService, `aiContent.service 应包含 ${endpoint}`).toContain(endpoint);
    }
    expect(aiService).not.toContain("/publish");
    expect(aiService).toContain("draft");
  });
});

describe("侧边栏「课程中心」由占位改为可用链接", () => {
  it("课程中心 → /courses 且 implemented: true", () => {
    expect(nav).toContain('label: "课程中心"');
    expect(nav).toContain('to: "/courses"');
    const line = nav.split(/\r?\n/).find((item) => item.includes('label: "课程中心"'));
    expect(line).toContain("implemented: true");
  });

  it("O-04 后学习路线已可用 (13 项零占位), 断言同步更新", () => {
    const line = nav.split(/\r?\n/).find((item) => item.includes('label: "学习路线"'));
    expect(line).toContain('to: "/learning-paths"');
    expect(line).toContain("implemented: true");
    expect(countOccurrences(nav, "implemented: false")).toBe(0);
  });

  it("子路由 (详情/语句编辑器/AI 生成) 归属到课程中心, 面包屑与标题不再显示裸 id", () => {
    expect(nav).toContain("findNavSubPath");
    expect(nav).toContain("normalized.startsWith(`${base}/`)");
    const sidebar = readSource("components/layout/AppSidebar.vue");
    expect(sidebar).toContain("activePath.value.startsWith(`${base}/`)");
  });
});
