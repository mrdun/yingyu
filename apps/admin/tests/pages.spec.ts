import { describe, expect, it } from "vitest";

import { PAGE_FILES, countOccurrences, fileExists, readSource } from "./helpers/admin-source";

/**
 * 页面完整性 + 布局 + 状态原则。
 * 这些断言防的回归:
 *  - 页面缺 loading/empty/error/分页 (用户看到白屏或误以为没数据)
 *  - 危险操作没有二次确认
 *  - 未实现模块被"藏起来"而不是明确标注后续批次
 */

const plansPage = readSource("pages/plans.vue");
const channelsPage = readSource("pages/payment-channels.vue");
const healthPage = readSource("pages/system/health.vue");
const dashboardPage = readSource("pages/dashboard.vue");
const sidebar = readSource("components/layout/AppSidebar.vue");
const layout = readSource("layouts/default.vue");
const nav = readSource("utils/nav.ts");

describe("已交付页面 (O-01 的 4 个 + O-02 的 7 个)", () => {
  it.each(PAGE_FILES)("%s 存在", (page) => {
    expect(fileExists(page), `${page} 应存在`).toBe(true);
  });

  it("每个页面都有 loading 与 error 状态", () => {
    for (const page of PAGE_FILES) {
      const source = readSource(page);
      expect(source, `${page} 应有 AppLoading`).toContain("AppLoading");
      expect(source, `${page} 应有 AppError`).toContain("AppError");
    }
  });

  it("每个列表页都有 empty 与分页状态", () => {
    for (const page of ["pages/plans.vue", "pages/payment-channels.vue"]) {
      const source = readSource(page);
      expect(source, `${page} 应有 AppEmpty`).toContain("AppEmpty");
      expect(source, `${page} 应有 AppPagination`).toContain("AppPagination");
      expect(source, `${page} 应使用 usePagedList`).toContain("usePagedList");
    }
  });
});

describe("Dashboard 不伪造后端没有的指标", () => {
  it("只用两个真实接口", () => {
    expect(dashboardPage).toContain("fetchAdminOverview");
    expect(dashboardPage).toContain("fetchDashboardOverview");
  });

  it("把取不到的指标列为「来源缺失」并显示占位符, 而不是编数字", () => {
    expect(dashboardPage).toContain("UNAVAILABLE_METRICS");
    expect(dashboardPage).toContain("待审核 Partner");
    expect(dashboardPage).toContain("待审核课程");
    expect(dashboardPage).toContain("MISSING_TEXT");
    expect(dashboardPage).toContain("来源缺失");
  });
});

describe("危险操作二次确认", () => {
  it("删除方案 / 启停方案都要确认", () => {
    expect(plansPage).toContain("AppConfirmDialog");
    expect(plansPage).toContain("askDelete");
    expect(plansPage).toContain("askToggleActive");
    expect(plansPage).toContain("不可撤销");
  });

  it("支付渠道开关要确认, 且缺凭据时给出警告", () => {
    expect(channelsPage).toContain("AppConfirmDialog");
    expect(channelsPage).toContain("askToggle");
    expect(channelsPage).toContain("configured === false");
  });
});

describe("支付渠道 / 系统健康不泄露机密", () => {
  it("支付渠道页只展示 enabled/configured/支持方式", () => {
    expect(channelsPage).toContain("presentEnabled");
    expect(channelsPage).toContain("presentConfigured");
    expect(channelsPage).toContain("methods");
    for (const forbidden of ["secret", "privateKey", "apiKey", "mchId", "cert"]) {
      expect(channelsPage).not.toContain(forbidden);
    }
  });

  it("系统健康页展示三个依赖且不渲染 details (可能含连接串)", () => {
    expect(healthPage).toContain("database");
    expect(healthPage).toContain("redis");
    expect(healthPage).toContain("logto");
    expect(healthPage).toContain("presentDependencyState");
    // details 只用于提示条数, 不逐条展示
    expect(healthPage).not.toContain("details[");
    expect(healthPage).not.toContain("report.details.database");
  });
});

describe("布局与导航", () => {
  it("默认布局含 Sidebar + Topbar", () => {
    expect(layout).toContain("AppSidebar");
    expect(layout).toContain("AppTopbar");
    expect(layout).toContain("resolvePageTitle");
    expect(layout).toContain("buildBreadcrumb");
  });

  it("侧边栏 13 项全部可用 (O-04 把最后一项占位 学习路线 改为可用), 零占位", () => {
    expect(countOccurrences(nav, /key: "/g)).toBe(13);
    expect(countOccurrences(nav, "implemented: true")).toBe(13);
    expect(countOccurrences(nav, "implemented: false")).toBe(0);
    expect(nav).not.toContain("to: null");

    for (const label of [
      "Dashboard",
      "用户",
      "课程中心",
      "学习路线",
      "会员方案",
      "会员",
      "订单",
      "支付渠道",
      "Partner",
      "佣金",
      "佣金规则",
      "业务设置",
      "系统健康",
    ]) {
      expect(nav, `导航应包含 ${label}`).toContain(`label: "${label}"`);
    }
  });

  it("未实现的模块点击提示「后续批次」, 不是静默无响应", () => {
    expect(sidebar).toContain("nav-placeholder");
    expect(sidebar).toContain("toast.placeholder(item.label)");
    expect(readSource("utils/nav.ts")).toContain("后续批次");
  });

  it("侧边栏底部有当前管理员与退出登录", () => {
    expect(sidebar).toContain("退出登录");
    expect(sidebar).toContain("signOut");
    expect(sidebar).toContain("adminLabel");
  });

  it("顶栏展示页面标题 / 面包屑 / 管理员身份", () => {
    const topbar = readSource("components/layout/AppTopbar.vue");
    expect(topbar).toContain("props.breadcrumb");
    expect(topbar).toContain("props.title");
    expect(topbar).toContain("adminLabel");
  });
});

describe("前台不直连数据库 / 不引入第二套 UI 框架", () => {
  it("没有数据库客户端依赖", () => {
    const pkg = readSource("package.json");
    for (const forbidden of ["prisma", "drizzle", "pg", "postgres", "mysql", "typeorm"]) {
      expect(pkg.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("没有引入 Element Plus / Ant Design 等第二套 UI 框架", () => {
    const pkg = readSource("package.json");
    for (const forbidden of ["element-plus", "ant-design", "naive-ui", "vuetify"]) {
      expect(pkg).not.toContain(forbidden);
    }
    expect(pkg).toContain("daisyui");
  });

  it("不 import apps/client (跨应用耦合)", () => {
    const pkg = readSource("package.json");
    expect(pkg).not.toContain("apps/client");
  });
});
