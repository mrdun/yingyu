<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";

import AppButton from "~/components/ui/AppButton.vue";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title: string;
    description?: string;
    /** 危险操作弹窗不允许点遮罩误关闭 */
    closeOnBackdrop?: boolean;
  }>(),
  { description: "", closeOnBackdrop: true },
);

const emit = defineEmits<{ "update:modelValue": [boolean] }>();

function close(): void {
  emit("update:modelValue", false);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") close();
}

function onBackdropClick(): void {
  if (props.closeOnBackdrop) close();
}

watch(
  () => props.modelValue,
  (open) => {
    if (typeof document === "undefined") return;
    if (open) {
      document.addEventListener("keydown", onKeydown);
      document.body.classList.add("overflow-hidden");
    } else {
      document.removeEventListener("keydown", onKeydown);
      document.body.classList.remove("overflow-hidden");
    }
  },
);

onBeforeUnmount(() => {
  if (typeof document === "undefined") return;
  document.removeEventListener("keydown", onKeydown);
  document.body.classList.remove("overflow-hidden");
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      data-testid="app-modal"
      @click.self="onBackdropClick"
    >
      <div class="w-full max-w-2xl rounded-box bg-base-100 shadow-soft-lg">
        <div class="flex items-start justify-between gap-4 border-b border-base-300 px-5 py-3">
          <div>
            <h2 class="text-base font-semibold">{{ title }}</h2>
            <p
              v-if="description"
              class="mt-0.5 text-xs text-base-content/60"
            >
              {{ description }}
            </p>
          </div>
          <AppButton
            size="sm"
            variant="ghost"
            aria-label="关闭"
            @click="close"
          >
            关闭
          </AppButton>
        </div>
        <div class="px-5 py-4">
          <slot />
        </div>
        <div
          v-if="$slots.footer"
          class="flex items-center justify-end gap-2 border-t border-base-300 px-5 py-3"
        >
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
