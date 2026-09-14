import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WORKBENCH_NAV_GROUPS, WORKBENCH_NAV_ITEMS } from "../../utils/workbenchNav";

/**
 * 工作台外壳 (app-shell) 骨架守卫 (源码级)。
 *
 * 阶段 1 只搬骨架: 固定侧栏 + 独立滚动面板 + 两种外壳切换。
 * 与仓库其它源码级守卫一致 —— tsconfig 继承 .nuxt/tsconfig.json, spec 里 import .vue
 * 会得到 TS2307, 因此这里读源码 / 读共用数据模块, 真实渲染由 RC 手工巡检验证。
 * 用 process.cwd() 定位源码: vitest 的 nuxt environment 下 import.meta.url 会触发
 * ERR_INVALID_URL_SCHEME, npm script 以 apps/client 为 cwd 运行。
 */
const readSource = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

const appRailPath = "components/workbench/AppRail.vue";
const layout = readSource("layouts/default.vue");
const appRail = readSource(appRailPath);
const workbenchNav = readSource("utils/workbenchNav.ts");

/**
 * 工作台 (登录后) 只许用 wb-* 调色板; 混入营销外壳(落地页)那一套就是回归。
 *   #FBF7E8 米黄底 · #F0EADA 米黄边 · #2F6FE8 / #2563EB 落地页按钮蓝 · #5B6B80 落地页次要文字
 *   #F8FAFC 是改造前工作台面板的浅灰底 (已被 wb-panel #F1F4FD 取代)
 * #4D96FF 白字只有 2.95:1 —— 工作台里一个都不许出现。
 */
const MARKETING_PALETTE = ["#FBF7E8", "#F0EADA", "#2F6FE8", "#2563EB", "#5B6B80", "#F8FAFC"];
const UNREADABLE_BLUE = "#4D96FF";

/**
 * 阶段 2 (会员中心主页) 新增/改动的文件。
 * 阶段 1 的调色板守卫只覆盖了 AppRail.vue 与 layouts/default.vue, 这里把范围补到本任务的页面文件,
 * 否则「主页混用米黄」可以绕过后卫直接上线。
 */
const MEMBER_CENTER_FILES = [
  "components/Home/index.vue",
  "components/Home/UserOverviewBar.vue",
  "components/Home/MembershipUpsell.vue",
  "components/Home/LearningStatsRow.vue",
  "components/Home/WeeklyStudyChart.vue",
  "components/Home/SentenceGoalCard.vue",
  "components/Home/CalendarGraph.vue",
  "components/CheckInCard.vue",
  "components/CheckInCalendar.vue",
  "components/DailyTasksCard.vue",
  "components/courses/RecentCoursePack.vue",
].map((path) => ({ path, source: readSource(path) }));

// 布局里两支外壳的源码片段: 工作台分支 = 「v-if="isWorkbenchShell"」到 <Navbar /> 之前
const workbenchBranch = layout.slice(
  layout.indexOf('v-if="isWorkbenchShell"'),
  layout.indexOf("<Navbar />"),
);
const marketingBranch = layout.slice(layout.indexOf("<Navbar />"));

describe("侧栏组件 AppRail.vue", () => {
  it("文件存在, 且菜单来自唯一的数据模块 (不会与旧侧栏各写一份)", () => {
    expect(existsSync(join(process.cwd(), appRailPath))).toBe(true);
    expect(appRail).toContain("WORKBENCH_NAV_ITEMS");
    expect(workbenchNav).toContain("export const WORKBENCH_NAV_GROUPS");
    expect(workbenchNav).toContain("export const WORKBENCH_NAV_ITEMS");
  });

  /**
   * 侧栏**不显示分组标题**(用户要求; 目标站侧栏也是一列平铺项)。
   * 分组数据保留只为表达顺序, 所以这里钉两件事:
   *   ① 分组标题数据仍在 (排序守卫用它); ② 组件不渲染 `group.title`。
   * 把 `{{ group.title }}` 那一段加回来 → 本用例立刻变红。
   */
  it("分组标题只在数据里 (表达顺序), 组件不渲染「主导航 / 学习工具 / 账户」", () => {
    expect(WORKBENCH_NAV_GROUPS.map((group) => group.title)).toEqual([
      "主导航",
      "学习工具",
      "账户",
    ]);

    // 组件按平铺列表渲染, 不再遍历分组
    expect(appRail).toContain('v-for="item in WORKBENCH_NAV_ITEMS"');
    expect(appRail).not.toContain("group.title");
    expect(appRail).not.toContain("WORKBENCH_NAV_GROUPS");
    for (const title of ["主导航", "学习工具", "账户"]) {
      expect(appRail, `侧栏不该出现分组标题「${title}」`).not.toContain(title);
    }
  });

  it("12 个路径一个不少, 顺序照目标站侧栏", () => {
    expect(WORKBENCH_NAV_ITEMS.map((item) => item.to)).toEqual([
      "/",
      "/my-courses",
      "/course-pack",
      "/learning-path",
      "/picture-word",
      "/review",
      "/rewards",
      "/stats",
      "/membership",
      "/partner",
      "/promotion",
      "/User/Setting",
    ]);
  });

  it("三张白卡: 品牌卡 (回首页) / 导航卡 (可滚动) / 用户卡 (复用 UserMenu)", () => {
    // 品牌卡整块可点回首页
    expect(appRail).toContain('to="/"');
    // 导航卡自身滚动, 侧栏不随内容滚动
    expect(appRail).toContain("overflow-y-auto");
    // 用户卡复用既有 UserMenu, 不另写一套菜单
    expect(appRail).toContain("useUserMenu");
    expect(appRail).toContain("openUserMenu");
    expect(appRail).toContain("useUserStore");
    expect(appRail).toContain("isFounderMembership");
  });

  it("侧栏是 fixed 212px 通高, 卡片间距 10px", () => {
    expect(appRail).toContain("fixed left-0 top-0");
    expect(appRail).toContain("h-screen");
    expect(appRail).toContain("lg:w-[212px]");
    expect(appRail).toContain("gap-[10px]");
  });

  it("激活态是浅蓝底 + 蓝字 + 左侧蓝条 (照目标站, 不是实心胶囊)", () => {
    // 用户已定: 会员中心等登录后页面按 juyouenglish.com 的配色 (白底 + 浅蓝面板 + #2C5AF4)
    expect(appRail).toContain("app-rail__item--on");
    expect(appRail).toContain("text-[#2C5AF4]");
    expect(appRail).toContain("bg-[#EFF6FF]");
    // 左侧 3px 蓝条由 .app-rail__item--on::before 提供
    expect(appRail).toMatch(/\.app-rail__item--on::before/);
    // 非激活态用 wb-muted
    expect(appRail).toContain("text-[#666666]");
    // 激活判定沿用改造前的 route.path === to
    expect(workbenchNav).toContain("return currentPath === to;");
  });

  it("兜底: 工作台外壳不得混用落地页(米黄)那一套色值, 也不得用不可读的 #4D96FF", () => {
    // #4D96FF 白字只有 2.95:1 —— 工作台里一个都不许出现
    expect(appRail).not.toMatch(new RegExp(UNREADABLE_BLUE, "i"));
    expect(layout).not.toMatch(new RegExp(UNREADABLE_BLUE, "i"));
    // 工作台必须用 wb-* 调色板, 不得混入营销外壳的米黄/旧蓝
    for (const marketingColor of MARKETING_PALETTE) {
      expect(appRail.toLowerCase()).not.toContain(marketingColor.toLowerCase());
      expect(layout.toLowerCase()).not.toContain(marketingColor.toLowerCase());
    }
    // 主色是目标站的 #2C5AF4 (白字 5.42:1, 通过 AA)
    expect(appRail).toContain("#2C5AF4");
  });
});

describe("工作台调色板: 会员中心主页 (阶段 2 新增/改动的文件)", () => {
  it("这些文件都不含落地页(米黄)那一套色值, 也不含不可读的 #4D96FF", () => {
    for (const file of MEMBER_CENTER_FILES) {
      const source = file.source.toLowerCase();

      for (const marketingColor of MARKETING_PALETTE) {
        expect(source).not.toContain(marketingColor.toLowerCase());
      }
      expect(source).not.toContain(UNREADABLE_BLUE.toLowerCase());
    }
  });

  it("这些文件用的是 wb-* 调色板 (白底 + #E5E7EB 卡片边 + #2C5AF4 主色 + #666666 次要文字)", () => {
    const allSources = MEMBER_CENTER_FILES.map((file) => file.source)
      .join("\n")
      .toLowerCase();

    expect(allSources).toContain("#2c5af4");
    expect(allSources).toContain("#e5e7eb");
    expect(allSources).toContain("#eff6ff");
    expect(allSources).toContain("#666666");
  });

  it("主页不再自带居中容器 / 内嵌导航 (外壳负责), 也不把旧组件清单抄回来", () => {
    const home = MEMBER_CENTER_FILES.find(
      (file) => file.path === "components/Home/index.vue",
    )?.source;

    expect(home).toBeTruthy();
    expect(home).not.toContain("max-w-screen-xl");
    expect(home).not.toContain("WorkNav");
    // 7 个区块按顺序铺开 (详细断言见 home-member-center.spec.ts)
    expect(home).toContain("<UserOverviewBar");
    expect(home).toContain("<SentenceGoalCard");
  });
});

describe("默认布局: 两种外壳的切换", () => {
  it("工作台分支渲染 AppRail 与独立滚动面板, 不含 Navbar / Footer", () => {
    expect(layout).toContain('v-if="isWorkbenchShell"');
    expect(workbenchBranch).toContain("<AppRail />");
    expect(workbenchBranch).not.toContain("<Navbar");
    expect(workbenchBranch).not.toContain("<Footer");
  });

  it("工作台面板: 左让 222px (212 + 10)、四周 10px、圆角 10px、内底 #F1F4FD、自身滚动", () => {
    expect(workbenchBranch).toContain("lg:ml-[222px]");
    expect(workbenchBranch).toContain("mt-[66px]");
    expect(workbenchBranch).toContain("lg:mt-[10px]");
    // 圆角与内底改用目标站的 10px / #F1F4FD (原米黄方案是 16px / #F8FAFC)
    expect(workbenchBranch).toContain("rounded-[10px]");
    expect(workbenchBranch).toContain("bg-[#F1F4FD]");
    expect(workbenchBranch).toContain("overflow-y-auto");
  });

  it("营销分支外观不变: Navbar + NuxtPage + Footer", () => {
    expect(marketingBranch).toContain("<Navbar />");
    expect(marketingBranch).toContain("<NuxtPage />");
    expect(marketingBranch).toContain("<Footer></Footer>");
  });

  it("UserMenu 只渲染一次且在两种外壳之外 (工作台用户卡复用的就是它)", () => {
    expect(layout.match(/<UserMenu \/>/g)?.length).toBe(1);
  });

  it("旧扁平侧栏不再出现在布局里 (它只服务营销外壳的登录态首页)", () => {
    expect(layout).not.toContain("WorkNav");
    expect(existsSync(join(process.cwd(), "components/WorkNav.vue"))).toBe(true);
  });
});

describe("小屏降级 (<1024px): 56px 工具条 + 抽屉", () => {
  it("工具条: 汉堡 + Logo, 只在 lg 以下出现", () => {
    expect(appRail).toContain("h-14");
    expect(appRail).toContain("lg:hidden");
    expect(appRail).toContain("☰");
  });

  it("抽屉: 260px 宽 + 半透明遮罩 + 点遮罩关闭, 桌面端常驻不位移", () => {
    expect(appRail).toContain("w-[260px]");
    expect(appRail).toContain("lg:translate-x-0");
    expect(appRail).toContain("-translate-x-full");
    // 遮罩铺满视口且点击关闭
    expect(appRail).toContain("fixed inset-0 z-40 bg-slate-900/40 lg:hidden");
    expect(appRail).toContain('@click="closeDrawer"');
  });

  it("内容不被 fixed 侧栏覆盖: 小屏给工具条让位并锁住外层滚动", () => {
    // 外层锁死视口并裁掉横向溢出, 小屏靠 mt-[66px] 让开 56px 工具条
    expect(workbenchBranch).toContain("h-screen w-full overflow-hidden");
    expect(workbenchBranch).toContain("mt-[66px]");
  });
});
