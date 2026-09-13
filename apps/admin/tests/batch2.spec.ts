import { describe, expect, it } from "vitest";

import {
  BATCH2_PAGE_FILES,
  countOccurrences,
  fileExists,
  listSourceFiles,
  readSource,
} from "./helpers/admin-source";

/**
 * O-02 批次 (7 个业务模块页面 + 佣金只读接口 + CI 门禁) 的源码级断言。
 *
 * 这些断言防的回归:
 *  - 页面绕开 service 层直接 fetch / 内联请求路径 (将来换 BFF 要满地改)
 *  - 管理员「授予会员」被写成「购买会员」(语义错误, 会被当成产生订单的购买入口)
 *  - 佣金比例在页面里硬编码 / 自行做除法 (规则变更后前端展示与实际计算不一致)
 *  - 退款/授予/审批这类不可撤销动作缺少二次确认 (误点即造成资金与权益事故)
 *  - 侧边栏仍把已交付模块显示为"后续批次"占位
 *  - 业务设置页让人以为可以在后台改系统密钥
 */

const usersPage = readSource("pages/users.vue");
const ordersPage = readSource("pages/orders.vue");
const membershipsPage = readSource("pages/memberships.vue");
const partnersPage = readSource("pages/partners.vue");
const commissionsPage = readSource("pages/commissions.vue");
const commissionRulesPage = readSource("pages/commission-rules.vue");
const businessSettingsPage = readSource("pages/settings/business.vue");
const nav = readSource("utils/nav.ts");
const formatUtil = readSource("utils/format.ts");

/** 佣金比例硬编码 token (与整体测试同一口径) */
const HARDCODED_RATE_TOKENS = ["0.4", "40%"];

describe("O-02 的 7 个页面", () => {
  it.each(BATCH2_PAGE_FILES)("%s 存在", (page) => {
    expect(fileExists(page), `${page} 应存在`).toBe(true);
  });

  it("每个页面都通过 services/*.service.ts 取数, 页面内无裸 fetch / $fetch / URL 字面量", () => {
    for (const page of BATCH2_PAGE_FILES) {
      const source = readSource(page);
      expect(source, `${page} 应显式 import service`).toContain('from "~/services/');
      expect(source, `${page} 不应出现 $fetch(`).not.toMatch(/\$fetch\(/);
      expect(source, `${page} 不应出现裸 fetch(`).not.toMatch(/(?<![\w$])fetch\(/);
      expect(source, `${page} 不应内联 /admin/ 请求路径`).not.toMatch(/["'`]\/admin\//);
      expect(source, `${page} 不应出现绝对 http(s) 地址`).not.toMatch(/https?:\/\//);
    }
  });

  it("每个页面都有 loading / error 状态, 列表页都有 empty + 分页", () => {
    for (const page of BATCH2_PAGE_FILES) {
      const source = readSource(page);
      expect(source, `${page} 应有 AppLoading`).toContain("AppLoading");
      expect(source, `${page} 应有 AppError`).toContain("AppError");
      expect(source, `${page} 应有 AppEmpty`).toContain("AppEmpty");
      expect(source, `${page} 应有 AppPagination`).toContain("AppPagination");
    }
  });

  it("列表页有搜索或过滤条件 (有意义才加)", () => {
    expect(usersPage).toContain("keyword");
    expect(ordersPage).toContain("statusFilter");
    expect(partnersPage).toContain("statusFilter");
    expect(commissionsPage).toContain("statusFilter");
  });

  it("有写操作的页面都用既有 toast 反馈结果 (用户页是只读, 无写操作)", () => {
    const writePages = [
      "pages/orders.vue",
      "pages/memberships.vue",
      "pages/partners.vue",
      "pages/commissions.vue",
      "pages/commission-rules.vue",
      "pages/settings/business.vue",
    ];
    for (const page of writePages) {
      const source = readSource(page);
      expect(source, `${page} 应使用 useAdminToast`).toContain("useAdminToast");
      expect(source, `${page} 应处理失败分支`).toContain("getErrorMessage");
    }
    // 用户页只读: 不引入任何写操作
    expect(usersPage).not.toContain("useAdminToast");
    expect(usersPage).not.toContain("adminApi.post");
  });
});

describe("用户管理不展示凭证, 取不到的字段标注「暂无数据」", () => {
  it("只调用 GET /admin/users (只读) 且不出现凭证字段", () => {
    expect(readSource("services/users.service.ts")).toContain("/admin/users");
    expect(usersPage).toContain("fetchAdminUsersPage");
    for (const forbidden of ["password", "accessToken", "refreshToken", "jwt", "secret"]) {
      expect(usersPage, `用户页不应出现 ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("会员状态 / Partner 状态在接口缺失时显示「暂无数据」并注明原因", () => {
    expect(usersPage).toContain("暂无数据");
    expect(usersPage).toContain("UNAVAILABLE_FIELDS");
    expect(usersPage).toContain("会员状态");
    expect(usersPage).toContain("Partner 状态");
    expect(usersPage).toContain("缺少按用户查询");
  });
});

describe("订单管理不改状态, 退款必须二次确认", () => {
  it("列表/详情/对账/退款四个接口都在 service 层", () => {
    const service = readSource("services/orders.service.ts");
    expect(service).toContain("/admin/dashboard/orders");
    expect(service).toContain("/admin/orders/${pathSegment(orderId)}");
    expect(service).toContain("/reconcile");
    expect(service).toContain("/refund");
    expect(ordersPage).toContain("reconcileOrder");
    expect(ordersPage).toContain("refundOrder");
  });

  it("前端不向任何写接口传订单状态 (只传订单 id)", () => {
    const service = readSource("services/orders.service.ts");
    expect(service).not.toContain("body:");
    expect(service).not.toMatch(/status:/);
    // 页面里不应给 status 赋值 (status === 比较不算)
    expect(ordersPage).not.toMatch(/status\s*=[^=]/);
    expect(ordersPage).not.toContain("adminApi");
  });

  it("展示 plan/金额/币种/状态/渠道/时间线", () => {
    for (const field of [
      "planId",
      "amountFen",
      "currency",
      "presentOrderStatus",
      "provider",
      "createdAt",
      "paidAt",
      "refundedAt",
    ]) {
      expect(ordersPage, `订单页应展示 ${field}`).toContain(field);
    }
  });

  it("退款走 AppConfirmDialog 且给出明确警告文案", () => {
    expect(ordersPage).toContain("AppConfirmDialog");
    expect(ordersPage).toContain("askRefund");
    expect(ordersPage).toContain("不可撤销");
    expect(ordersPage).toContain("撤销该订单产生的会员权益");
  });
});

describe("会员管理只「授予会员」", () => {
  it("文案是「授予会员」, 不出现「购买会员」", () => {
    expect(membershipsPage).toContain("授予会员");
    expect(membershipsPage).not.toContain("购买会员");
    expect(readSource("services/memberships.service.ts")).toContain("/admin/memberships/grant");
  });

  it("授予会员是危险动作: 二次确认 + 说明不产生订单/支付", () => {
    expect(membershipsPage).toContain("AppConfirmDialog");
    expect(membershipsPage).toContain("askGrant");
    expect(membershipsPage).toContain("不产生订单与支付流水");
  });
});

describe("Partner 四个动作都要二次确认", () => {
  it("approve / reject / suspend / activate 都经 service 且都走确认弹窗", () => {
    const service = readSource("services/partners.service.ts");
    for (const action of ["approve", "reject", "suspend", "activate"]) {
      expect(service, `service 应包含 ${action}`).toContain(action);
      expect(partnersPage, `Partner 页应包含 ${action} 动作`).toContain(action);
    }
    expect(partnersPage).toContain("AppConfirmDialog");
    expect(partnersPage).toContain("askAction");
    expect(service).toContain("pathSegment(id)");
  });

  it("展示 referral code / 佣金规则 / 状态 / 创建时间", () => {
    for (const field of ["referralCode", "formatBps", "presentPartnerStatus", "createdAt"]) {
      expect(partnersPage, `Partner 页应展示 ${field}`).toContain(field);
    }
  });
});

describe("佣金管理只读展示接口返回值", () => {
  it("列表用本批次新增的 GET /admin/commissions, 三个 POST 用于状态推进", () => {
    const service = readSource("services/commissions.service.ts");
    expect(service).toContain('"/admin/commissions"');
    expect(service).toContain("/admin/commissions/confirm");
    expect(service).toContain("/payable");
    expect(service).toContain("/settle");
    expect(commissionsPage).toContain("fetchCommissionsPage");
    expect(commissionsPage).toContain("statusFilter");
  });

  it("金额与比例只来自接口字段, 前端不做除法/乘法", () => {
    expect(commissionsPage).toContain("formatYuanFromFen(row.commissionFen)");
    expect(commissionsPage).toContain("formatYuanFromFen(row.orderAmountFen)");
    expect(commissionsPage).toContain("formatBps(row.rateBps)");
    expect(commissionsPage).not.toMatch(/commissionFen\s*[*+/-]\s*[0-9(]/);
    expect(commissionsPage).not.toMatch(/rateBps\s*[*+/-]\s*[0-9(]/);
    for (const token of HARDCODED_RATE_TOKENS) {
      expect(commissionsPage).not.toContain(token);
    }
  });

  it("状态推进 (标记可结算/结算/确认到期) 都要二次确认", () => {
    expect(commissionsPage).toContain("AppConfirmDialog");
    expect(commissionsPage).toContain("askPayable");
    expect(commissionsPage).toContain("askSettle");
    expect(commissionsPage).toContain("askConfirmExpired");
  });
});

describe("佣金比例只在共享 utility 里换算", () => {
  it("utils/format.ts 提供 formatBps / parsePercentToBps 与本文件唯一的换算常量", () => {
    expect(formatUtil).toContain("export function formatBps");
    expect(formatUtil).toContain("export function parsePercentToBps");
    expect(formatUtil).toContain("BPS_PER_PERCENT");
    expect(formatUtil).toContain("MAX_BPS");
  });

  it("换算常量只出现在 utils/format.ts (其它文件必须复用它)", () => {
    const offenders = listSourceFiles().filter(
      (file) => file !== "utils/format.ts" && readSource(file).includes("BPS_PER_PERCENT"),
    );
    expect(offenders).toEqual([]);
  });

  it("佣金规则页显示百分比、提交 bps, 且没有任何硬编码比例", () => {
    expect(commissionRulesPage).toContain("formatBps(rule.rateBps)");
    expect(commissionRulesPage).toContain("parsePercentToBps");
    for (const token of HARDCODED_RATE_TOKENS) {
      expect(commissionRulesPage, `佣金规则页不应出现 ${token}`).not.toContain(token);
    }
    expect(commissionRulesPage).not.toMatch(/\*\s*100\b/);
    expect(commissionRulesPage).not.toMatch(/\/\s*100\b/);
    expect(readSource("services/commissionRules.service.ts")).toContain("rateBps");
  });

  it("全部源码都不含写死的比例 (防止换一种写法又硬编码回来)", () => {
    const offenders = listSourceFiles().filter((file) =>
      HARDCODED_RATE_TOKENS.some((token) => readSource(file).includes(token)),
    );
    expect(offenders).toEqual([]);
  });
});

describe("业务设置", () => {
  it("明确说明此处只有业务参数, 系统密钥不可编辑", () => {
    expect(businessSettingsPage).toContain("系统密钥不在后台可编辑范围");
    expect(businessSettingsPage).toContain("isEditableBusinessSetting");
    expect(businessSettingsPage).toContain("部署环境");
  });

  it("每个已知参数都有中文说明 (以接口返回为准)", () => {
    const util = readSource("utils/businessSettings.ts");
    for (const key of [
      "refund_window_hours",
      "commission_settlement_days",
      "partner_enabled",
      "lifetime_partner_required",
      "order_expire_minutes",
      "currency",
    ]) {
      expect(util, `业务参数说明应覆盖 ${key}`).toContain(key);
    }
    expect(util).toContain("description");
    expect(businessSettingsPage).toContain("describeBusinessSetting");
  });

  it("读写都经 service (GET 列表 + PATCH 单键)", () => {
    const service = readSource("services/businessSettings.service.ts");
    expect(service).toContain("/admin/business-settings");
    expect(service).toContain("adminApi.patch");
    expect(service).toContain("pathSegment(key)");
    expect(businessSettingsPage).toContain("fetchBusinessSettings");
    expect(businessSettingsPage).toContain("updateBusinessSetting");
  });

  it("保存业务参数也要二次确认", () => {
    expect(businessSettingsPage).toContain("AppConfirmDialog");
    expect(businessSettingsPage).toContain("askSave");
  });
});

describe("侧边栏: O-02 的 7 个模块已启用", () => {
  const ENABLED_ROUTES: Array<[string, string]> = [
    ["用户", "/users"],
    ["会员", "/memberships"],
    ["订单", "/orders"],
    ["Partner", "/partners"],
    ["佣金", "/commissions"],
    ["佣金规则", "/commission-rules"],
    ["业务设置", "/settings/business"],
  ];

  it.each(ENABLED_ROUTES)("%s → %s 是可点击链接", (label, route) => {
    expect(nav).toContain(`label: "${label}"`);
    expect(nav).toContain(`to: "${route}"`);
  });

  it("导航里 7 个模块不再带「后续批次」占位 (O-03 后只剩 1 项占位: 学习路线)", () => {
    expect(countOccurrences(nav, "implemented: false")).toBe(1);
    expect(countOccurrences(nav, "implemented: true")).toBe(12);
    const stillPlaceholder = ["学习路线"];
    for (const label of stillPlaceholder) {
      const line = nav.split(/\r?\n/).find((item) => item.includes(`label: "${label}"`));
      expect(line, `${label} 应保持占位`).toContain("to: null");
      expect(line).toContain("implemented: false");
    }
  });

  it("侧边栏只为未实现项渲染占位按钮", () => {
    const sidebar = readSource("components/layout/AppSidebar.vue");
    expect(sidebar).toContain('v-if="item.to"');
    expect(sidebar).toContain("nav-placeholder");
  });
});

describe("Admin 前台不直连数据库 / 不跨应用 import", () => {
  it("页面与 service 都不出现数据库客户端或跨应用 import", () => {
    for (const file of BATCH2_PAGE_FILES) {
      const source = readSource(file);
      for (const forbidden of ["apps/client", "drizzle", "prisma", "@earthworm/schema"]) {
        expect(source, `${file} 不应包含 ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
