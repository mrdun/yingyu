import { reactive } from "vue";

import { fetchUserInfo } from "~/services/auth";
import type { AdminIdentity } from "~/types/admin";

/**
 * 当前登录管理员身份 (只用于展示: 侧边栏底部 + 顶栏)。
 * 身份信息不是权限来源 —— 权限由 stores/admin-access.ts 向后端探测。
 */

export interface AdminSessionState {
  identity: AdminIdentity | null;
  pending: boolean;
  error: string | null;
  loaded: boolean;
}

const state = reactive<AdminSessionState>({
  identity: null,
  pending: false,
  error: null,
  loaded: false,
});

let inflight: Promise<void> | null = null;

type RawUserInfo = {
  sub?: string;
  username?: string | null;
  name?: string | null;
  email?: string | null;
};

export async function loadAdminIdentity(force = false): Promise<void> {
  if (!force && state.loaded) return;
  if (inflight) return inflight;

  state.pending = true;
  state.error = null;

  inflight = (async () => {
    try {
      const info = (await fetchUserInfo()) as unknown as RawUserInfo | undefined;
      if (!info) {
        state.error = "无法获取管理员信息";
        return;
      }
      state.identity = {
        subject: info.sub ?? "",
        username: info.username ?? null,
        email: info.email ?? null,
        name: info.name ?? null,
      };
      state.loaded = true;
    } catch (error) {
      state.error = error instanceof Error ? error.message : "无法获取管理员信息";
    } finally {
      state.pending = false;
      inflight = null;
    }
  })();

  return inflight;
}

export function resetAdminIdentity(): void {
  state.identity = null;
  state.loaded = false;
  state.error = null;
}

export function useAdminSessionState(): AdminSessionState {
  return state;
}
