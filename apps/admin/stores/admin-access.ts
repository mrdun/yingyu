import { reactive } from "vue";

import { getErrorMessage, getHttpStatus, isForbidden, isUnauthorized } from "~/services/admin-api";
import { fetchPlansHealth } from "~/services/plans.service";

/**
 * 管理员权限判定 (前端只是 UX, 后端 AuthGuard 才是最终防线)。
 *
 * 判定依据: 探测一个需要 admin:access 的轻量接口 (GET /admin/plans/health)。
 *  200        → granted (有权限)
 *  403        → forbidden (已登录但无权限 —— 必须显示 Forbidden, 不能伪装成未登录)
 *  401        → unauthenticated (未登录/凭证失效 → 走 Logto 登录)
 *  其它/网络  → error (既不授予也不禁止, 页面展示明确的错误状态)
 */

export type AccessStatus = "unknown" | "granted" | "forbidden" | "unauthenticated" | "error";

export interface AccessState {
  status: AccessStatus;
  message: string | null;
  checkedAt: number | null;
}

const state = reactive<AccessState>({
  status: "unknown",
  message: null,
  checkedAt: null,
});

let inflight: Promise<AccessStatus> | null = null;

function setState(status: AccessStatus, message: string | null = null): AccessStatus {
  state.status = status;
  state.message = message;
  state.checkedAt = Date.now();
  return status;
}

export async function verifyAdminAccess(options: { force?: boolean } = {}): Promise<AccessStatus> {
  if (!options.force && state.status === "granted") return "granted";
  // 并发调用共用同一个探测请求 (路由守卫与页面可能同时触发)
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      await fetchPlansHealth();
      return setState("granted");
    } catch (error) {
      if (isForbidden(error)) {
        return setState("forbidden", "当前账号没有管理后台权限 (缺少 admin:access)");
      }
      if (isUnauthorized(error)) {
        return setState("unauthenticated", "登录状态已失效, 需要重新登录");
      }
      const status = getHttpStatus(error);
      const hint = typeof status === "number" ? ` (HTTP ${status})` : "";
      return setState("error", `无法确认管理权限${hint}: ${getErrorMessage(error)}`);
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function resetAdminAccess(): void {
  setState("unknown");
}

export function useAdminAccessState(): AccessState {
  return state;
}
