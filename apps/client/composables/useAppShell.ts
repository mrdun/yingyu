import { useRoute } from "#imports";
import { computed } from "vue";

import { useAuthState } from "~/services/auth";
import { resolveAppShell } from "~/utils/appShell";

/**
 * 当前页面该用哪种外壳 (工作台 / 营销)。
 *
 * 判定规则本身是纯函数 (utils/appShell.ts), 这里只负责把响应式输入
 * (route.path + 登录态) 接进去 —— 规则改动只改一处, 测试盯纯函数。
 */
export function useAppShell() {
  const route = useRoute();
  const { isAuthenticated } = useAuthState();

  const shell = computed(() => resolveAppShell(route.path, isAuthenticated.value));

  return {
    shell,
    isWorkbenchShell: computed(() => shell.value === "workbench"),
    isMarketingShell: computed(() => shell.value === "marketing"),
  };
}
