import type { ComputedRef, Ref, ShallowRef } from "vue";
import { computed, ref, shallowRef } from "vue";

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  getErrorMessage,
  getHttpStatus,
  isForbidden,
  isUnauthorized,
} from "~/services/admin-api";
import type { ServerPage } from "~/types/admin";

/**
 * 服务端分页列表状态机 (loading / empty / error / 401 / 403 / 分页)。
 *
 * 与 usePagedList (前端分页, 用于后端返回完整数组的接口) 并列:
 * users / orders / commissions 三个接口是服务端分页, 页码与过滤条件变化时重新取数,
 * 总数以接口返回的 total 为准 —— 不在前端推算总数。
 */
export interface ServerPagedList<T> {
  items: ShallowRef<T[]>;
  total: Ref<number>;
  page: Ref<number>;
  pageSize: Ref<number>;
  totalPages: ComputedRef<number>;
  pending: Ref<boolean>;
  errorMessage: Ref<string | null>;
  statusCode: Ref<number | undefined>;
  unauthenticated: ComputedRef<boolean>;
  forbidden: ComputedRef<boolean>;
  isEmpty: ComputedRef<boolean>;
  /** 按当前页码与过滤条件加载 */
  load: () => Promise<void>;
  /** 过滤条件变化后回到第 1 页加载 */
  reload: () => Promise<void>;
  setPage: (next: number) => void;
}

export function useServerPagedList<T>(
  fetchPage: (params: { page: number; pageSize: number }) => Promise<ServerPage<T>>,
  options: { pageSize?: number } = {},
): ServerPagedList<T> {
  const requestedSize = Math.trunc(Number(options.pageSize ?? DEFAULT_PAGE_SIZE));
  const pageSize = ref(
    Number.isFinite(requestedSize)
      ? Math.min(Math.max(1, requestedSize), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE,
  );
  const page = ref(1);
  const items = shallowRef<T[]>([]);
  const total = ref(0);
  const pending = ref(false);
  const errorMessage = ref<string | null>(null);
  const statusCode = ref<number | undefined>(undefined);

  const unauthenticated = computed(() => statusCode.value === 401);
  const forbidden = computed(() => statusCode.value === 403);
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
  const isEmpty = computed(() => !pending.value && !errorMessage.value && items.value.length === 0);

  async function load(): Promise<void> {
    pending.value = true;
    errorMessage.value = null;
    statusCode.value = undefined;

    try {
      const result = await fetchPage({ page: page.value, pageSize: pageSize.value });
      const maxPage = Math.max(1, Math.ceil(Number(result.total ?? 0) / pageSize.value));

      if (page.value > maxPage) {
        // 数据变少 (例如按状态过滤) 时回退到最后一页, 避免停在空白页
        page.value = maxPage;
        const last = await fetchPage({ page: page.value, pageSize: pageSize.value });
        items.value = last.items ?? [];
        total.value = Number(last.total ?? 0);
      } else {
        items.value = result.items ?? [];
        total.value = Number(result.total ?? 0);
      }
    } catch (error) {
      // 出错时不保留上一页数据: 展示旧数据会让人以为当前过滤条件生效了
      items.value = [];
      total.value = 0;
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

  function setPage(next: number): void {
    const target = Math.trunc(Number(next));
    if (!Number.isFinite(target)) return;
    const clamped = Math.min(Math.max(1, target), totalPages.value);
    if (clamped === page.value) return;
    page.value = clamped;
    void load();
  }

  async function reload(): Promise<void> {
    page.value = 1;
    await load();
  }

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
    pending,
    errorMessage,
    statusCode,
    unauthenticated,
    forbidden,
    isEmpty,
    load,
    reload,
    setPage,
  };
}
