/**
 * 工作台侧栏 (AppRail) 的导航数据 —— 11 项 / 三组的唯一来源。
 *
 * 为什么单独抽文件:
 *   1. AppRail 与「营销外壳里登录后的旧首页侧栏」(components/WorkNav.vue) 展示同一份菜单,
 *      两处各写一份迟早会漂移 (菜单改名要改两个文件, 漏一个就是线上两个入口不一致);
 *   2. 分组与顺序是信息架构的一部分, 放在纯数据里才能被源码级守卫钉住
 *      (见 utils/tests/workbenchNav.spec.ts)。
 *
 * 图标沿用现有 emoji 方案 (本轮不做图标库统一)。
 * 激活判定沿用改造前的逻辑: `route.path === to` (子路径不点亮父项)。
 */

export interface WorkbenchNavItem {
  label: string;
  to: string;
  icon: string;
}

export interface WorkbenchNavGroup {
  /** 分组标题: caption 字号 (12px/600) + text-muted 色 */
  title: string;
  items: WorkbenchNavItem[];
}

export const WORKBENCH_NAV_GROUPS: WorkbenchNavGroup[] = [
  {
    title: "主导航",
    items: [
      { label: "主页", to: "/", icon: "🏠" },
      { label: "课程广场", to: "/course-pack", icon: "📚" },
      { label: "课程向导", to: "/learning-path", icon: "🗺️" },
      { label: "我的课程", to: "/my-courses", icon: "🎒" },
    ],
  },
  {
    title: "学习工具",
    items: [
      { label: "看图学词", to: "/picture-word", icon: "🖼️" },
      { label: "复习", to: "/review", icon: "🔁" },
      { label: "奖励", to: "/rewards", icon: "🎁" },
      { label: "成长报告", to: "/stats", icon: "📈" },
    ],
  },
  {
    title: "账户",
    items: [
      { label: "会员", to: "/membership", icon: "👑" },
      { label: "推广中心", to: "/partner", icon: "🤝" },
      { label: "设置", to: "/User/Setting", icon: "⚙️" },
    ],
  },
];

/** 平铺后的 11 项 (旧版扁平侧栏 WorkNav.vue 直接复用, 不重排顺序) */
export const WORKBENCH_NAV_ITEMS: WorkbenchNavItem[] = WORKBENCH_NAV_GROUPS.flatMap(
  (group) => group.items,
);

export function isWorkbenchNavActive(currentPath: string, to: string): boolean {
  return currentPath === to;
}
