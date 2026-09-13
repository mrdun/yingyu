<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    description?: string;
  }>(),
  { title: "暂无数据", description: "" },
);
</script>

<template>
  <div
    class="flex flex-col items-center justify-center gap-1 py-10 text-center"
    data-testid="app-empty"
  >
    <p class="text-sm font-medium text-base-content/80">{{ title }}</p>
    <p
      v-if="description"
      class="max-w-md text-xs text-base-content/60"
    >
      {{ description }}
    </p>
    <slot />
  </div>
</template>
