<script setup lang="ts">
import type { AdminStatementRow } from "~/types/admin";
import type { StatementFormSubmit } from "~/types/ui";
import type { StatementFormErrors } from "~/utils/statementForm";

import { reactive, ref, watch } from "vue";

import AppInput from "~/components/form/AppInput.vue";
import AppButton from "~/components/ui/AppButton.vue";
import AppModal from "~/components/ui/AppModal.vue";
import {
  STATEMENT_SOURCE_TYPES,
  emptyStatementForm,
  statementRowToForm,
  validateStatementForm,
} from "~/utils/statementForm";

/**
 * 语句 新建 / 编辑 表单。
 *
 * 字段: chinese / english / soundmark / sourceType(text|audio|video) /
 *       audioUrl / startMs / endMs / order。
 * 校验只在表单层 (utils/statementForm.ts): 音频类型才要求音频与时间轴,
 * startMs/endMs 为非负整数且 endMs > startMs —— 后端不加业务规则。
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    mode?: "create" | "edit";
    statement?: AdminStatementRow | null;
    submitting?: boolean;
  }>(),
  { mode: "create", statement: null, submitting: false },
);

const emit = defineEmits<{
  "update:modelValue": [boolean];
  submit: [StatementFormSubmit];
}>();

const form = reactive(emptyStatementForm());
const errors = ref<StatementFormErrors>({});

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    errors.value = {};
    const next =
      props.mode === "edit" && props.statement
        ? statementRowToForm(props.statement)
        : emptyStatementForm();
    Object.assign(form, next);
  },
);

const isAudio = () => form.sourceType === "audio";

function onSubmit(): void {
  if (props.submitting) return;

  const result = validateStatementForm(form);
  errors.value = result.errors;
  if (!result.payload) return;

  const payload = result.payload;
  if (!payload.chinese || !payload.english) return;

  emit("submit", {
    mode: props.mode,
    statementId: props.mode === "edit" ? props.statement?.id ?? "" : "",
    payload: { ...payload, chinese: payload.chinese, english: payload.english },
  });
}

function close(): void {
  if (props.submitting) return;
  emit("update:modelValue", false);
}
</script>

<template>
  <AppModal
    :model-value="modelValue"
    :title="props.mode === 'create' ? '新增语句' : '编辑语句'"
    description="音频 / 时间轴字段仅在素材类型为 audio 时必填; 修改内容会让课程包退回草稿待审核"
    :close-on-backdrop="!props.submitting"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="flex flex-col gap-3">
      <AppInput
        v-model="form.chinese"
        label="中文 (chinese)"
        required
        :error="errors.chinese"
        placeholder="中文释义"
      />
      <AppInput
        v-model="form.english"
        label="英文 (english)"
        required
        :error="errors.english"
        placeholder="英文原文"
      />
      <AppInput
        v-model="form.soundmark"
        label="音标 (soundmark)"
        :error="errors.soundmark"
        placeholder="例如 /həˈloʊ/"
      />

      <label class="form-control w-full">
        <span class="label pb-1 text-xs font-medium text-base-content/70">
          素材类型 (sourceType)
        </span>
        <select
          v-model="form.sourceType"
          class="select select-bordered select-sm w-full"
          aria-label="素材类型"
        >
          <option
            v-for="option in STATEMENT_SOURCE_TYPES"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
        <span
          v-if="errors.sourceType"
          class="label pb-0 pt-1 text-xs text-error"
        >
          {{ errors.sourceType }}
        </span>
      </label>

      <AppInput
        v-model="form.audioUrl"
        label="音频地址 (audioUrl)"
        :required="isAudio()"
        :error="errors.audioUrl"
        :hint="isAudio() ? '音频类型必填' : '非音频类型可留空'"
        placeholder="例如 /audio/lesson-1/0.mp3"
      />

      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <AppInput
          v-model="form.startMs"
          label="起始时间 startMs (毫秒)"
          :required="isAudio()"
          :error="errors.startMs"
          :hint="isAudio() ? '音频类型必填, 非负整数' : '非音频类型可留空'"
          placeholder="例如 0"
        />
        <AppInput
          v-model="form.endMs"
          label="结束时间 endMs (毫秒)"
          :error="errors.endMs"
          hint="填了就必须大于 startMs"
          placeholder="例如 1500"
        />
      </div>

      <AppInput
        v-model="form.order"
        label="排序 (order)"
        :error="errors.order"
        hint="数字越小越靠前; 也可用列表里的上移 / 下移"
        placeholder="留空自动排序"
      />
    </div>

    <template #footer>
      <AppButton
        size="sm"
        variant="ghost"
        :disabled="props.submitting"
        @click="close"
      >
        取消
      </AppButton>
      <AppButton
        size="sm"
        :loading="props.submitting"
        @click="onSubmit"
      >
        保存
      </AppButton>
    </template>
  </AppModal>
</template>
