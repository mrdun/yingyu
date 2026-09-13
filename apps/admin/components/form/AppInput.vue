<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: string | number;
    label?: string;
    type?: string;
    placeholder?: string;
    hint?: string;
    error?: string | null;
    disabled?: boolean;
    required?: boolean;
    /** 纯展示用: 表单里的 id 不允许修改时使用 */
    readonly?: boolean;
  }>(),
  {
    label: "",
    type: "text",
    placeholder: "",
    hint: "",
    error: null,
    disabled: false,
    required: false,
    readonly: false,
  },
);

const emit = defineEmits<{ "update:modelValue": [string] }>();

function onInput(event: Event): void {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <label class="form-control w-full">
    <span
      v-if="props.label"
      class="label pb-1 text-xs font-medium text-base-content/70"
    >
      {{ props.label }}
      <span
        v-if="props.required"
        class="text-error"
      >
        *
      </span>
    </span>
    <input
      :type="props.type"
      :value="props.modelValue"
      :placeholder="props.placeholder"
      :disabled="props.disabled"
      :readonly="props.readonly"
      class="input input-sm input-bordered w-full"
      :class="[props.error ? 'input-error' : '', props.readonly ? 'bg-base-200' : '']"
      @input="onInput"
    />
    <span
      v-if="props.error"
      class="label pb-0 pt-1 text-xs text-error"
    >
      {{ props.error }}
    </span>
    <span
      v-else-if="props.hint"
      class="label pb-0 pt-1 text-xs text-base-content/60"
    >
      {{ props.hint }}
    </span>
  </label>
</template>
