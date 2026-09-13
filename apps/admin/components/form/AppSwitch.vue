<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    label?: string;
    disabled?: boolean;
    loading?: boolean;
  }>(),
  { label: "", disabled: false, loading: false },
);

const emit = defineEmits<{ "update:modelValue": [boolean] }>();

function onChange(event: Event): void {
  if (props.disabled || props.loading) return;
  emit("update:modelValue", (event.target as HTMLInputElement).checked);
}
</script>

<template>
  <label class="flex items-center gap-2">
    <input
      type="checkbox"
      class="toggle toggle-sm"
      :checked="props.modelValue"
      :disabled="props.disabled || props.loading"
      @change="onChange"
    />
    <span
      v-if="props.loading"
      class="loading loading-spinner loading-xs"
    ></span>
    <span
      v-if="props.label"
      class="text-xs text-base-content/70"
    >
      {{ props.label }}
    </span>
  </label>
</template>
