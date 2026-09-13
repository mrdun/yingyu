<script setup lang="ts">
import AppButton from "~/components/ui/AppButton.vue";
import AppModal from "~/components/ui/AppModal.vue";

/**
 * 危险操作二次确认。
 * 删除方案 / 开关支付渠道这类会直接影响线上收入的动作必须走这里。
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: "danger" | "primary";
    loading?: boolean;
  }>(),
  {
    confirmLabel: "确认",
    cancelLabel: "取消",
    tone: "danger",
    loading: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [boolean];
  confirm: [];
  cancel: [];
}>();

function cancel(): void {
  if (props.loading) return;
  emit("cancel");
  emit("update:modelValue", false);
}
</script>

<template>
  <AppModal
    :model-value="modelValue"
    :title="title"
    :close-on-backdrop="!loading"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <p class="text-sm text-base-content/80">{{ message }}</p>
    <template #footer>
      <AppButton
        variant="ghost"
        size="sm"
        :disabled="loading"
        @click="cancel"
      >
        {{ cancelLabel }}
      </AppButton>
      <AppButton
        :variant="tone === 'danger' ? 'danger' : 'primary'"
        size="sm"
        :loading="loading"
        @click="emit('confirm')"
      >
        {{ confirmLabel }}
      </AppButton>
    </template>
  </AppModal>
</template>
