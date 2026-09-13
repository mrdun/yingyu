import { computed } from "vue";

import { resetAdminAccess, useAdminAccessState, verifyAdminAccess } from "~/stores/admin-access";

export function useAdminAccess() {
  const state = useAdminAccessState();

  return {
    state,
    status: computed(() => state.status),
    message: computed(() => state.message),
    isGranted: computed(() => state.status === "granted"),
    isForbidden: computed(() => state.status === "forbidden"),
    /** 401: 需要重新登录 */
    isUnauthenticated: computed(() => state.status === "unauthenticated"),
    /** 其它错误: 无法确认权限 (后端不通等), 不能当成没权限 */
    isIndeterminate: computed(() => state.status === "error"),
    verify: verifyAdminAccess,
    reset: resetAdminAccess,
  };
}
