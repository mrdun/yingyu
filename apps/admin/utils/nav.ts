/**
 * 左侧导航 (13 项)。
 * O-03 批次后 12 项已实现 (Dashboard/用户/课程中心/会员方案/会员/订单/支付渠道/Partner/
 * 佣金/佣金规则/业务设置/系统健康), 仅剩 1 项 (学习路线) 仍是「可见但禁用」的占位项,
 * 点击提示"后续批次" (见 AppSidebar)。
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
  { key: "users", label: "用户", to: "/users", implemented: true },
  { key: "course-center", label: "课程中心", to: "/courses", implemented: true },
  { key: "learning-path", label: "学习路线", to: null, implemented: false },
  { key: "plans", label: "会员方案", to: "/plans", implemented: true },
  { key: "members", label: "会员", to: "/memberships", implemented: true },
  { key: "orders", label: "订单", to: "/orders", implemented: true },
  { key: "payment-channels", label: "支付渠道", to: "/payment-channels", implemented: true },
  { key: "partner", label: "Partner", to: "/partners", implemented: true },
  { key: "commission", label: "佣金", to: "/commissions", implemented: true },
  { key: "commission-rules", label: "佣金规则", to: "/commission-rules", implemented: true },
  { key: "business-settings", label: "业务设置", to: "/settings/business", implemented: true },
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
  const exact = NAV_ITEMS.find((item) => item.to !== null && normalizePath(item.to) === normalized);
  if (exact) return exact;

  // 子路由 (课程中心的 /courses/:id、/courses/:id/courses/:courseId、/courses/ai)
  // 归属到最长的导航前缀, 否则详情页会变成"没有归属"的裸路径。
  let matched: NavItem | undefined;
  let matchedLength = -1;
  for (const item of NAV_ITEMS) {
    if (item.to === null) continue;
    const base = normalizePath(item.to);
    if (normalized.startsWith(`${base}/`) && base.length > matchedLength) {
      matched = item;
      matchedLength = base.length;
    }
  }
  return matched;
}

/** 当前路径相对所属导航项的子路径片段 (命中导航项本身时为空数组) */
export function findNavSubPath(path: string): string[] {
  const normalized = normalizePath(path);
  const item = findNavItemByPath(normalized);
  if (!item || item.to === null) return [];

  const base = normalizePath(item.to);
  if (normalized === base) return [];
  return normalized.slice(base.length).split("/").filter(Boolean);
}

/** 面包屑: 首页 / 当前模块 / 子路径 (未命中时退化为路径片段) */
export function buildBreadcrumb(path: string): string[] {
  const normalized = normalizePath(path);
  const item = findNavItemByPath(normalized);
  if (!item) {
    const segments = normalized.split("/").filter(Boolean);
    return [HOME_NAV_ITEM.label, ...segments];
  }
  const trail =
    item.key === HOME_NAV_ITEM.key ? [HOME_NAV_ITEM.label] : [HOME_NAV_ITEM.label, item.label];
  return [...trail, ...findNavSubPath(normalized)];
}

export function resolvePageTitle(path: string): string {
  const normalized = normalizePath(path);
  const item = findNavItemByPath(normalized);
  if (item) {
    const sub = findNavSubPath(normalized);
    const last = sub[sub.length - 1];
    return last ? `${item.label} · ${last}` : item.label;
  }
  const segments = normalized.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  return last ? last : HOME_NAV_ITEM.label;
}
