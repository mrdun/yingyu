import { computed } from "vue";

import {
  loadAdminIdentity,
  resetAdminIdentity,
  useAdminSessionState,
} from "~/stores/admin-session";

export function useAdminSession() {
  const state = useAdminSessionState();

  return {
    state,
    identity: computed(() => state.identity),
    pending: computed(() => state.pending),
    error: computed(() => state.error),
    /** 展示名: 用户名 → 邮箱 → sub → 未知 */
    displayName: computed(() => {
      const identity = state.identity;
      if (!identity) return null;
      return identity.username || identity.email || identity.subject || null;
    }),
    load: loadAdminIdentity,
    reset: resetAdminIdentity,
  };
}
