<script setup lang="ts">
import { computed } from "vue";

import AppButton from "~/components/ui/AppButton.vue";
import { formatCount } from "~/utils/format";

const props = defineProps<{
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}>();

const emit = defineEmits<{ "update:page": [number] }>();

const rangeText = computed(() => {
  if (props.total === 0) return "共 0 条";
  const start = (props.page - 1) * props.pageSize + 1;
  const end = Math.min(props.page * props.pageSize, props.total);
  return `第 ${start}-${end} 条 / 共 ${formatCount(props.total)} 条`;
});

function go(target: number): void {
  const next = Math.min(Math.max(1, target), Math.max(1, props.totalPages));
  if (next !== props.page) emit("update:page", next);
}
</script>

<template>
  <div
    class="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 px-4 py-3 text-xs text-base-content/70"
    data-testid="app-pagination"
  >
    <span>{{ rangeText }}</span>
    <div class="flex items-center gap-2">
      <AppButton
        size="sm"
        variant="ghost"
        :disabled="page <= 1"
        @click="go(page - 1)"
      >
        上一页
      </AppButton>
      <span class="tabular-nums">{{ page }} / {{ totalPages }}</span>
      <AppButton
        size="sm"
        variant="ghost"
        :disabled="page >= totalPages"
        @click="go(page + 1)"
      >
        下一页
      </AppButton>
    </div>
  </div>
</template>
