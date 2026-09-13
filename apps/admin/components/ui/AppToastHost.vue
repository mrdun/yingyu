<script setup lang="ts">
import { useAdminToast } from "~/composables/useAdminToast";
import type { ToastTone } from "~/stores/toast";

const toast = useAdminToast();

const TONE_CLASS: Record<ToastTone, string> = {
  info: "alert-info",
  success: "alert-success",
  warning: "alert-warning",
  error: "alert-error",
};
</script>

<template>
  <div
    class="pointer-events-none fixed right-4 top-4 z-[60] flex w-full max-w-sm flex-col gap-2"
    data-testid="app-toast-host"
  >
    <div
      v-for="item in toast.toasts"
      :key="item.id"
      class="alert pointer-events-auto shadow-soft"
      :class="TONE_CLASS[item.tone]"
    >
      <div class="flex flex-col">
        <span class="text-sm font-medium">{{ item.title }}</span>
        <span
          v-if="item.description"
          class="text-xs opacity-90"
        >
          {{ item.description }}
        </span>
      </div>
      <button
        class="btn btn-ghost btn-xs"
        aria-label="关闭提示"
        @click="toast.dismiss(item.id)"
      >
        关闭
      </button>
    </div>
  </div>
</template>
