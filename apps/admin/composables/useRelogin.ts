import { useRoute } from "vue-router";

import { signIn } from "~/services/auth";

/**
 * 会话中途失效 (401) 时的重新登录入口:
 * 带上当前路径, 登录后回到原页面。403 不走这里 —— 那是有权限问题, 重新登录无法解决。
 */
export function useRelogin() {
  const route = useRoute();
  return () => signIn(String(route.fullPath));
}
