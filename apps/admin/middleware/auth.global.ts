import { abortNavigation, defineNuxtRouteMiddleware, navigateTo } from "nuxt/app";

import { signIn, waitForAuthReady } from "~/services/auth";
import { resetAdminAccess, verifyAdminAccess } from "~/stores/admin-access";

/**
 * 全局路由守卫 (管理后台)。
 *
 * 流程:
 *  1. 公开路由 (/callback, /forbidden) 直接放行 —— 这两个页面必须能在"未登录/无权限"下渲染,
 *     否则会形成登录/跳转死循环。
 *  2. 等 Logto 初始化落定 (初始化期间 isAuthenticated 还是 false, 直接读会把已登录用户踢去登录页)。
 *  3. 未登录 → 跳 Logto 登录 (带上原路径, 登录后回到原页面)。
 *  4. 已登录 → 向后端探测 admin:access:
 *     - 403 → /forbidden (已登录但无权限, 页面明确说明, 不再走登录)
 *     - 401 → 重新登录 (有次数上限, 防止无限重定向)
 *     - 其它 → 放行, 由页面自己展示"无法确认权限"的错误状态
 */

const PUBLIC_PATHS = ["/callback", "/forbidden"];

/** 同一会话内最多重登一次; 超出说明不是"没登录"而是凭证/配置问题, 直接给出明确页面 */
const MAX_REAUTH_ATTEMPTS = 1;
const REAUTH_COUNTER_KEY = "admin:reauth-attempts";

export function isPublicPath(path: string): boolean {
  const normalized = path.split("?")[0] ?? path;
  return PUBLIC_PATHS.includes(normalized);
}

function readReauthAttempts(): number {
  try {
    return Number(sessionStorage.getItem(REAUTH_COUNTER_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeReauthAttempts(value: number): void {
  try {
    sessionStorage.setItem(REAUTH_COUNTER_KEY, String(value));
  } catch {
    // sessionStorage 不可用时退化为"不限制", 由后端 401 兜底
  }
}

export default defineNuxtRouteMiddleware(async (to) => {
  if (isPublicPath(to.path)) return;

  const authenticated = await waitForAuthReady();
  if (!authenticated) {
    signIn(to.fullPath);
    return abortNavigation();
  }

  const status = await verifyAdminAccess();

  if (status === "granted") {
    writeReauthAttempts(0);
    return;
  }

  if (status === "forbidden") {
    // 已登录但无权限: 显示 Forbidden 页面 (不得伪装成"未登录", 也不得无限重定向)
    return navigateTo("/forbidden");
  }

  if (status === "unauthenticated") {
    if (readReauthAttempts() >= MAX_REAUTH_ATTEMPTS) {
      writeReauthAttempts(0);
      return navigateTo("/forbidden?reason=session");
    }
    writeReauthAttempts(readReauthAttempts() + 1);
    resetAdminAccess();
    signIn(to.fullPath);
    return abortNavigation();
  }

  // status === "unknown" | "error": 无法确认权限 (后端不可达等), 放行并让页面展示错误态
  return;
});
