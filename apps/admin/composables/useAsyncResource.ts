import type { Ref } from "vue";

import { computed, ref, shallowRef } from "vue";

import { getErrorMessage, getHttpStatus, isForbidden, isUnauthorized } from "~/services/admin-api";

/**
 * 统一的「加载中 / 空 / 错误 / 无权限」状态机。
 * 列表页与详情页都用它, 避免各页面各写一套 try/catch 而漏掉 401/403 分支:
 * 401 只能提示重新登录, 403 必须给出 Forbidden 说明, 两者不可混为一谈。
 */

export interface AsyncResourceOptions<T> {
  /** 判定"空数据" (默认 null / 空数组) */
  isEmpty?: (data: T) => boolean;
  /** 是否在 setup 阶段立即加载 */
  immediate?: boolean;
}

export interface AsyncResource<T> {
  data: Ref<T | null>;
  pending: Ref<boolean>;
  errorMessage: Ref<string | null>;
  statusCode: Ref<number | undefined>;
  /** 401: 登录状态失效 (页面应给出重新登录入口) */
  unauthenticated: Ref<boolean>;
  /** 403: 已登录但无权限 (页面应给出 Forbidden 说明) */
  forbidden: Ref<boolean>;
  isEmpty: Ref<boolean>;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
}

function defaultIsEmpty(data: unknown): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data)) return data.length === 0;
  return false;
}

export function useAsyncResource<T>(
  loader: () => Promise<T>,
  options: AsyncResourceOptions<T> = {},
): AsyncResource<T> {
  const data = shallowRef<T | null>(null);
  const pending = ref(false);
  const errorMessage = ref<string | null>(null);
  const statusCode = ref<number | undefined>(undefined);

  const unauthenticated = computed(() => statusCode.value === 401);
  const forbidden = computed(() => statusCode.value === 403);
  const isEmpty = computed(() => {
    if (pending.value || errorMessage.value) return false;
    return options.isEmpty ? options.isEmpty(data.value as T) : defaultIsEmpty(data.value);
  });

  async function load(): Promise<void> {
    pending.value = true;
    errorMessage.value = null;
    statusCode.value = undefined;

    try {
      data.value = await loader();
    } catch (error) {
      // 保留状态码: 页面据此区分 401 (重新登录) 与 403 (无权限)
      statusCode.value = getHttpStatus(error);
      if (isUnauthorized(error)) {
        errorMessage.value = "登录状态已失效, 请重新登录";
      } else if (isForbidden(error)) {
        errorMessage.value = "当前账号没有管理后台权限";
      } else {
        errorMessage.value = getErrorMessage(error);
      }
    } finally {
      pending.value = false;
    }
  }

  if (options.immediate !== false) {
    void load();
  }

  return {
    data,
    pending,
    errorMessage,
    statusCode,
    unauthenticated,
    forbidden,
    isEmpty,
    load,
    refresh: load,
  };
}
