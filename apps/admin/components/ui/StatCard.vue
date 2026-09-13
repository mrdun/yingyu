<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    value: string;
    hint?: string;
    /** 数据来源缺失的指标: 用弱化样式并展示原因 */
    muted?: boolean;
  }>(),
  { hint: "", muted: false },
);
</script>

<template>
  <div
    class="rounded-box border border-base-300 bg-base-100 px-4 py-3"
    :class="muted ? 'opacity-70' : ''"
    data-testid="stat-card"
  >
    <p class="text-xs text-base-content/60">{{ label }}</p>
    <p class="mt-1 text-xl font-semibold tabular-nums">{{ value }}</p>
    <p
      v-if="hint"
      class="mt-1 text-xs text-base-content/50"
    >
      {{ hint }}
    </p>
  </div>
</template>
