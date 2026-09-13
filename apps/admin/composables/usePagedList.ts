import type { MaybeRefOrGetter } from "vue";

import { computed, ref, toValue, watch } from "vue";

import { DEFAULT_PAGE_SIZE } from "~/services/admin-api";

/**
 * 列表分页状态 (loading / empty / error 由 useAsyncResource 提供)。
 *
 * /admin/plans 与 /admin/payment-channels 都返回完整数组 (后端未分页), 因此这里是
 * 前端分页: 只负责切页与边界收敛。将来接入后端分页接口时, 只需把 source 换成
 * 服务端返回的当前页数据, 页面结构不变。
 */
export function usePagedList<T>(
  source: MaybeRefOrGetter<readonly T[]>,
  options: { pageSize?: number } = {},
) {
  const page = ref(1);
  const pageSize = ref(options.pageSize ?? DEFAULT_PAGE_SIZE);

  const total = computed(() => toValue(source).length);
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
  const items = computed(() => {
    const all = toValue(source);
    const start = (page.value - 1) * pageSize.value;
    return all.slice(start, start + pageSize.value);
  });

  function setPage(next: number): void {
    const target = Math.trunc(Number(next));
    if (!Number.isFinite(target)) return;
    page.value = Math.min(Math.max(1, target), totalPages.value);
  }

  // 数据变少时把页码收敛回有效范围 (否则会停在一个空白页)
  watch(totalPages, (max) => {
    if (page.value > max) page.value = max;
  });

  return {
    page,
    pageSize,
    total,
    totalPages,
    items,
    setPage,
    canGoPrev: computed(() => page.value > 1),
    canGoNext: computed(() => page.value < totalPages.value),
    goPrev: () => setPage(page.value - 1),
    goNext: () => setPage(page.value + 1),
  };
}
