/**
 * 外壳判定 (纯函数, 可单测)。
 *
 * 用户端只有两种外壳:
 *   1. 工作台外壳 (app-shell): 登录后的业务页 —— 固定侧栏 AppRail + 独立滚动的内容面板;
 *   2. 营销外壳: 未登录的任何页面 / 落地页 `/` / 沉浸式练习 `/game/*` / 协议页
 *      —— 顶部通栏 Navbar + 居中单栏 + Footer。
 *
 * 这里是判定的唯一来源: layouts/default.vue 通过 composables/useAppShell.ts 调用,
 * 布局里不再内联路径黑名单 (历史上 HIDDEN_PATHS / HIDDEN_PREFIXES 写在布局里,
 * 无法单测, 且改一处要翻模板才知道)。
 *
 * ⚠️ `/game/*` 是**全屏沉浸式练习**, 必须继续走营销外壳:
 * 一旦套进 212px 侧栏, 答题区会被挤压, 这是硬性回退点。
 */
export type AppShellKind = "workbench" | "marketing";

/**
 * 恒走营销外壳的路径。
 *
 * ⚠️ `/` **不在**此列: 登录后 `/` 渲染的是会员中心主页 (components/Home), 属于工作台外壳;
 * 未登录时 `/` 渲染落地页 (components/Landing), 由下面的 `!isAuthenticated` 分支兜住。
 * 所以 `/` 的外壳是"跟着登录态走"的, 不能钉进这个名单。
 */
export const MARKETING_ONLY_PATHS: readonly string[] = ["/privacy-policy", "/terms"];

/** 恒走营销外壳的前缀 (全屏沉浸式练习) */
export const MARKETING_ONLY_PREFIXES: readonly string[] = ["/game"];

/**
 * 已登录: 除落地页 / 协议页 / 沉浸练习外, 全部业务页都进工作台外壳。
 * 未登录: 一律营销外壳 —— 游客绝不能看到「没有用户信息的空壳侧栏」。
 */
export function resolveAppShell(path: string, isAuthenticated: boolean): AppShellKind {
  if (!isAuthenticated) return "marketing";
  if (MARKETING_ONLY_PATHS.includes(path)) return "marketing";
  if (MARKETING_ONLY_PREFIXES.some((prefix) => path.startsWith(prefix))) return "marketing";
  return "workbench";
}

export function isWorkbenchShell(path: string, isAuthenticated: boolean): boolean {
  return resolveAppShell(path, isAuthenticated) === "workbench";
}
