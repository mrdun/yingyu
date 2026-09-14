import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WORKBENCH_NAV_ITEMS } from "../../utils/workbenchNav";

// 用户端导航与信息架构守卫 (源码级)。
//
// 这一轮把会员功能入口从游客落地页拿掉, 给会员中心补上「主页 / 我的课程」,
// 并把「学习档案」整页收进「我的课程」。断言分两类:
//   1. 侧边栏与落地页导航的最终内容 (标签 -> 路径 -> 图标), 改名/回退都会变红;
//   2. 被取代的旧入口真的消失了 (页面文件 + 侧边栏引用)。
//
// 菜单数据已抽到 utils/workbenchNav.ts (AppRail 与营销外壳里的旧侧栏 WorkNav 共用一份),
// 因此「侧边栏 11 项」的内容断言直接读那份数据, 并额外钉住 WorkNav 确实复用了它。
//
// 为什么不做挂载测试: 与仓库其它源码级守卫一致 —— tsconfig 继承 .nuxt/tsconfig.json,
// spec 里 import .vue 会得到 TS2307; 真实渲染由 RC 手工巡检验证。
// 用 process.cwd() 定位源码: vitest 的 nuxt environment 下 import.meta.url 会触发
// ERR_INVALID_URL_SCHEME, npm script 以 apps/client 为 cwd 运行。
const readSource = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

const workNav = readSource("components/WorkNav.vue");
const workbenchNav = readSource("utils/workbenchNav.ts");
const navbar = readSource("components/Navbar.vue");
const homeIndex = readSource("components/Home/index.vue");
const myCoursesPage = readSource("pages/my-courses/index.vue");
const learningPathPage = readSource("pages/learning-path/index.vue");

// 取 menuItems / HEADER_OPTIONS 这类数组常量的源码片段, 避免被文件里其它同名路径干扰
function arrayBlock(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  if (start === -1) throw new Error(`未找到声明: ${declaration}`);
  const end = source.indexOf("];", start);
  if (end === -1) throw new Error(`未找到数组结束: ${declaration}`);
  return source.slice(start, end);
}

const menuItems = arrayBlock(workbenchNav, "export const WORKBENCH_NAV_GROUPS");
const headerOptions = arrayBlock(navbar, "const HEADER_OPTIONS: AnchorAttributes[] = [");

// 断言某个菜单项形如 { label: "x", to: "y", icon: "z" } (允许任意缩进/换行)
function expectMenuItem(block: string, label: string, to: string, icon: string) {
  const escapedTo = to.replace("/", String.raw`\/`);
  expect(block).toMatch(
    new RegExp(
      String.raw`\{\s*label:\s*"` +
        label +
        String.raw`"\s*,\s*to:\s*"` +
        escapedTo +
        String.raw`"\s*,\s*icon:\s*"` +
        icon +
        String.raw`"\s*\}`,
    ),
  );
}

describe("工作台侧边栏菜单 (utils/workbenchNav.ts, AppRail 与 WorkNav 共用) 的文字导航", () => {
  it("新增「主页」, 目标与 LOGO 一致 (/)", () => {
    expectMenuItem(menuItems, "主页", "/", "🏠");
  });

  it("「开始学习」改名「课程广场」, 路径不变", () => {
    expectMenuItem(menuItems, "课程广场", "/course-pack", "📚");
  });

  it("「学习路线」改名「课程向导」, 路径不变", () => {
    expectMenuItem(menuItems, "课程向导", "/learning-path", "🗺️");
  });

  it("新增「我的课程」入口 (/my-courses)", () => {
    expectMenuItem(menuItems, "我的课程", "/my-courses", "🎒");
  });

  it("四项新导航排在最前 (主页 -> 课程广场 -> 课程向导 -> 我的课程)", () => {
    const order = ["主页", "课程广场", "课程向导", "我的课程"].map((label) =>
      menuItems.indexOf(`label: "${label}"`),
    );

    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // 看图学词是这四项之后的第一项, 保证新增入口没有插在中间
    expect(menuItems.indexOf(`label: "看图学词"`)).toBeGreaterThan(order[3]);
  });

  it("侧边栏仍是 11 项", () => {
    expect(menuItems.split("label:").length - 1).toBe(11);
  });

  it("旧标签与已被取代的入口不再出现在侧边栏", () => {
    // 共用菜单数据与旧扁平侧栏组件都不得回退
    for (const source of [workbenchNav, workNav]) {
      expect(source).not.toContain("开始学习");
      expect(source).not.toContain("学习路线");
      expect(source).not.toContain("掌握列表");
      expect(source).not.toContain("学习档案");
      expect(source).not.toContain("/mastered-elements");
      expect(source).not.toContain("/archive");
    }
  });

  it("高亮判定仍是 route.path === to (子路径不点亮父项), 且两个侧栏共用同一份菜单", () => {
    expect(workbenchNav).toContain("export function isWorkbenchNavActive");
    expect(workbenchNav).toContain("return currentPath === to;");
    expect(workNav).toContain("isWorkbenchNavActive(route.path, item.to)");
    expect(WORKBENCH_NAV_ITEMS).toHaveLength(11);
  });
});

describe("游客落地页导航 (Navbar) 只留非会员入口", () => {
  it("HEADER_OPTIONS 不再含会员功能页面", () => {
    expect(headerOptions).not.toContain("/review");
    expect(headerOptions).not.toContain("/stats");
    expect(headerOptions).not.toContain("/rewards");
  });

  it("只剩 功能 / 问题 / 联系我们 三个页内锚点 (「文档」外链已下线)", () => {
    expect(headerOptions).toContain("#features");
    expect(headerOptions).toContain("#faq");
    expect(headerOptions).toContain("#contact");
    expect(headerOptions).toContain('"功能"');
    expect(headerOptions).toContain('"问题"');
    expect(headerOptions).toContain('"联系我们"');

    // 「文档」指向上游帮助站点 (helpDocsURL), 已随第三方外链清理一并移除; 不得回退
    expect(headerOptions).not.toContain("helpDocsURL");
    expect(headerOptions).not.toContain('"文档"');
    // 其余三项必须是页内锚点, 不能借机换成任何外部地址
    expect(headerOptions).not.toMatch(/href:\s*[`"']https?:/);

    // 恰好三项: 防止有人"顺手"再补一个外链回来
    expect(headerOptions.split("name:").length - 1).toBe(3);
  });

  it("登录态的金币余额入口保留 (它是登录后的 /rewards 入口, 不属于落地页导航)", () => {
    expect(navbar).toContain('to="/rewards"');
    expect(navbar).toContain("coinBalance");
  });

  it("落地页导航仍只在游客首页显示", () => {
    expect(navbar).toContain("route.path === '/' && !isAuthenticated()");
  });
});

describe("「我的课程」页 (/my-courses)", () => {
  it("页面存在并包含标题与四块内容", () => {
    expect(myCoursesPage).toContain("我的课程");
    expect(myCoursesPage).toContain("最近学习");
    expect(myCoursesPage).toContain("复习本");
    expect(myCoursesPage).toContain("掌握列表");
    expect(myCoursesPage).toContain("生词本");
    expect(myCoursesPage).toContain("课程广场");
  });

  it("最近学习复用搬迁后的组件 (不再从 components/Home 取)", () => {
    expect(myCoursesPage).toContain("~/components/courses/RecentCoursePack.vue");
    expect(myCoursesPage).not.toContain("components/Home/");
    expect(existsSync(join(process.cwd(), "components/courses/RecentCoursePack.vue"))).toBe(true);
    expect(existsSync(join(process.cwd(), "components/Home/RecentCoursePack.vue"))).toBe(false);
  });

  it("游客态给出登录提示与登录按钮 (不传回调路径, 与现有各页一致)", () => {
    expect(myCoursesPage).toContain("登录后可查看你的课程");
    expect(myCoursesPage).toContain("isAuthenticated()");
    expect(myCoursesPage).toContain('@click="signIn()"');
    expect(myCoursesPage).toContain('import { isAuthenticated, signIn } from "~/services/auth"');
  });

  it("复习本沿用 /archive 的取数方式 (今日待复习, 失败显示 -)", () => {
    expect(myCoursesPage).toContain("fetchReviewToday");
    expect(myCoursesPage).toContain('statLabel: "今日待复习"');
    expect(myCoursesPage).toContain("String(queue.length)");
  });

  it("生词本仍是禁用占位「开发中」", () => {
    expect(myCoursesPage).toContain("const isNewWordBookEnabled = false");
    expect(myCoursesPage).toContain("开发中");
  });
});

describe("「学习档案」已被「我的课程」整页取代", () => {
  it("pages/archive.vue 已删除", () => {
    expect(existsSync(join(process.cwd(), "pages/archive.vue"))).toBe(false);
  });

  it("掌握列表页面本身保留 (只是不占侧边栏)", () => {
    expect(existsSync(join(process.cwd(), "pages/mastered-elements.vue"))).toBe(true);
  });
});

describe("课程向导标题与侧边栏一致", () => {
  it("learning-path 页标题与空态文案已改名", () => {
    expect(learningPathPage).toContain("课程向导");
    expect(learningPathPage).not.toContain("学习路线");
  });
});

describe("主页「我的课程」区块给出进完整页的入口", () => {
  it("标题行有「全部 →」指向 /my-courses", () => {
    expect(homeIndex).toContain('to="/my-courses"');
    expect(homeIndex).toContain("全部 →");
  });

  it("课程广场入口改由最后一格的「+ 添加课程」承载 (4 列栅格形态)", () => {
    // 阶段 2 重排主页时, 标题行不再单独放一个「课程广场」文字链接 ——
    // 入口收进「我的课程」区块最后一格的虚线格 (仍然指向 /course-pack, 没有丢入口)。
    const recentCoursePack = readSource("components/courses/RecentCoursePack.vue");

    expect(homeIndex).toContain(':member-center="true"');
    expect(recentCoursePack).toContain('to="/course-pack"');
    expect(recentCoursePack).toContain("+ 添加课程");
  });
});
