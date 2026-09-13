<script setup lang="ts">
import type { TableColumn } from "~/types/ui";

/**
 * 表格外壳 (UI 基元)。
 *
 * 只负责 thead 与整体排版, 行内容由页面通过默认插槽提供:
 * 这样每行单元格仍然直接用页面自己的强类型数据, 不需要字符串 key 映射或 any。
 * loading / empty / error / 分页状态由页面用 AppLoading / AppEmpty / AppError /
 * AppPagination 组合 (见三个列表页)。
 */
withDefaults(
  defineProps<{
    columns: TableColumn[];
    /** 无数据时是否仍然渲染表头 */
    showHeaderWhenEmpty?: boolean;
  }>(),
  { showHeaderWhenEmpty: true },
);

function alignClass(align: TableColumn["align"]): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}
</script>

<template>
  <div data-testid="data-table">
    <div
      v-if="$slots.toolbar"
      class="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-4 py-3"
    >
      <slot name="toolbar" />
    </div>
    <div class="overflow-x-auto">
      <table class="table">
        <thead v-if="showHeaderWhenEmpty || $slots.default">
          <tr>
            <th
              v-for="column in columns"
              :key="column.key"
              class="whitespace-nowrap text-xs uppercase tracking-wide text-base-content/60"
              :class="[alignClass(column.align), column.widthClass ?? '']"
            >
              {{ column.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <slot />
        </tbody>
      </table>
    </div>
  </div>
</template>
