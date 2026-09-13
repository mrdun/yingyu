<script setup lang="ts">
import { computed } from "vue";

import type { StatusTone } from "~/utils/status";

const props = withDefaults(
  defineProps<{
    label: string;
    tone?: StatusTone;
    size?: "sm" | "md";
  }>(),
  { tone: "neutral", size: "sm" },
);

const TONE_CLASS: Record<StatusTone, string> = {
  success: "badge-success",
  warning: "badge-warning",
  error: "badge-error",
  info: "badge-info",
  neutral: "badge-ghost",
};

const toneClass = computed(() => TONE_CLASS[props.tone]);
</script>

<template>
  <span
    class="badge gap-1"
    :class="[toneClass, size === 'sm' ? 'badge-sm' : '']"
  >
    <slot />
    {{ label }}
  </span>
</template>
