/**
 * 左侧导航 (13 项)。
 * 未实现的模块显示为「可见但禁用」的占位项, 点击提示"后续批次" (见 AppSidebar)。
 * implemented=false 的项没有路由, 因此也不会进入面包屑。
 */
export interface NavItem {
  key: string;
  label: string;
  /** 已实现模块的路由; 未实现模块为 null */
  to: string | null;
  /** 是否已在本批次实现 */
  implemented: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Dashboard", to: "/dashboard", implemented: true },
  { key: "users", label: "用户", to: null, implemented: false },
  { key: "course-center", label: "课程中心", to: null, implemented: false },
  { key: "learning-path", label: "学习路线", to: null, implemented: false },
  { key: "plans", label: "会员方案", to: "/plans", implemented: true },
  { key: "members", label: "会员", to: null, implemented: false },
  { key: "orders", label: "订单", to: null, implemented: false },
  { key: "payment-channels", label: "支付渠道", to: "/payment-channels", implemented: true },
  { key: "partner", label: "Partner", to: null, implemented: false },
  { key: "commission", label: "佣金", to: null, implemented: false },
  { key: "commission-rules", label: "佣金规则", to: null, implemented: false },
  { key: "business-settings", label: "业务设置", to: null, implemented: false },
  { key: "system-health", label: "系统健康", to: "/system/health", implemented: true },
];

export const HOME_NAV_ITEM: NavItem = NAV_ITEMS[0]!;

/** 未实现模块的统一提示文案 */
export const PLACEHOLDER_NOTICE = "该模块将在后续批次上线";

export function normalizePath(path: string): string {
  const withoutQuery = String(path ?? "").split("?")[0] ?? "";
  const withoutHash = withoutQuery.split("#")[0] ?? "";
  if (withoutHash.length > 1 && withoutHash.endsWith("/")) return withoutHash.slice(0, -1);
  return withoutHash || "/";
}

export function findNavItemByPath(path: string): NavItem | undefined {
  const normalized = normalizePath(path);
  return NAV_ITEMS.find((item) => item.to !== null && normalizePath(item.to) === normalized);
}

/** 面包屑: 首页 / 当前模块 (未命中时退化为路径片段) */
export function buildBreadcrumb(path: string): string[] {
  const normalized = normalizePath(path);
  const item = findNavItemByPath(normalized);
  if (!item) {
    const segments = normalized.split("/").filter(Boolean);
    return [HOME_NAV_ITEM.label, ...segments];
  }
  if (item.key === HOME_NAV_ITEM.key) return [HOME_NAV_ITEM.label];
  return [HOME_NAV_ITEM.label, item.label];
}

export function resolvePageTitle(path: string): string {
  const item = findNavItemByPath(path);
  if (item) return item.label;
  const segments = normalizePath(path).split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  return last ? last : HOME_NAV_ITEM.label;
}
