<script setup lang="ts">
import { computed } from "vue";

type ButtonVariant = "primary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: ButtonSize;
    type?: "button" | "submit";
    loading?: boolean;
    disabled?: boolean;
  }>(),
  {
    variant: "primary",
    size: "md",
    type: "button",
    loading: false,
    disabled: false,
  },
);

// 显式声明 click: 避免 Vue 再把原生 click 透传到根元素造成"点一次触发两次"
const emit = defineEmits<{ click: [MouseEvent] }>();

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  outline: "btn-outline",
  ghost: "btn-ghost",
  danger: "btn-error",
};

const variantClass = computed(() => VARIANT_CLASS[props.variant]);
const sizeClass = computed(() => (props.size === "sm" ? "btn-sm" : ""));
const isDisabled = computed(() => props.disabled || props.loading);

function onClick(event: MouseEvent): void {
  if (isDisabled.value) {
    event.preventDefault();
    return;
  }
  emit("click", event);
}
</script>

<template>
  <button
    :type="type"
    class="btn gap-2"
    :class="[variantClass, sizeClass]"
    :disabled="isDisabled"
    @click="onClick"
  >
    <span
      v-if="loading"
      class="loading loading-spinner loading-xs"
    ></span>
    <slot />
  </button>
</template>
