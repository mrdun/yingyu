<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string;
  }>(),
  { label: "加载中" },
);
</script>

<template>
  <div
    class="flex flex-col items-center justify-center gap-2 py-10 text-sm text-base-content/70"
    data-testid="app-loading"
  >
    <span class="loading loading-spinner loading-md"></span>
    <span>{{ label }}</span>
  </div>
</template>
