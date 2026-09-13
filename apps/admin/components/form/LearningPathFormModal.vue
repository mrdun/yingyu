<script setup lang="ts">
import type { AdminLearningPathRow } from "~/types/admin";
import type { LearningPathFormSubmit } from "~/types/ui";

import { reactive, ref, watch } from "vue";

import AppInput from "~/components/form/AppInput.vue";
import AppButton from "~/components/ui/AppButton.vue";
import AppModal from "~/components/ui/AppModal.vue";
import { formatDateTime } from "~/utils/format";
import { presentLearningPathPublished } from "~/utils/learningPath";

/**
 * 学习路线 新建 / 编辑 表单。
 *
 * 新建: title(必填) / description / cover / order —— 后端固定写入 isPublished=false,
 *   要对外可见必须再走「发布」(PATCH /admin/learning-paths/:id/publish)。
 * 编辑: 只改属性, 不改发布状态 (发布状态有独立的二次确认入口)。
 *
 * order 与课程包/课程/语句排序同一套规则 (@IsOptional @IsInt @Min(0)):
 * 留空表示不提交该字段 (编辑时保持原值), 填了就必须是非负整数。
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    mode?: "create" | "edit";
    path?: AdminLearningPathRow | null;
    submitting?: boolean;
  }>(),
  { mode: "create", path: null, submitting: false },
);

const emit = defineEmits<{
  "update:modelValue": [boolean];
  submit: [LearningPathFormSubmit];
}>();

interface LearningPathFormState {
  title: string;
  description: string;
  cover: string;
  order: string;
}

const form = reactive<LearningPathFormState>({
  title: "",
  description: "",
  cover: "",
  order: "",
});

const errors = reactive<Record<keyof LearningPathFormState, string | null>>({
  title: null,
  description: null,
  cover: null,
  order: null,
});

const updatedAtText = ref("");

function resetErrors(): void {
  for (const key of Object.keys(errors) as Array<keyof LearningPathFormState>) {
    errors[key] = null;
  }
}

function fill(): void {
  if (props.mode === "edit" && props.path) {
    form.title = props.path.title;
    form.description = props.path.description;
    form.cover = props.path.cover ?? "";
    form.order = String(props.path.order);
    updatedAtText.value = formatDateTime(props.path.updatedAt);
    return;
  }
  form.title = "";
  form.description = "";
  form.cover = "";
  // 新建不预填 order: 留空则后端按 0 写入 (排在最前, 可在列表里再调整)
  form.order = "";
  updatedAtText.value = "";
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    resetErrors();
    fill();
  },
);

function validate(): boolean {
  resetErrors();
  if (!form.title.trim()) errors.title = "标题必填";

  const raw = form.order.trim();
  if (raw && (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))) {
    errors.order = "排序必须是非负整数";
  }

  return !errors.title && !errors.order;
}

function onSubmit(): void {
  if (props.submitting) return;
  if (!validate()) return;

  const payload: LearningPathFormSubmit["payload"] = {
    title: form.title.trim(),
    description: form.description.trim(),
    cover: form.cover.trim(),
  };

  // 只在填了排序时提交 order (后端 dto.order !== undefined 才 set)
  const rawOrder = form.order.trim();
  if (rawOrder) payload.order = Number(rawOrder);

  emit("submit", {
    mode: props.mode,
    id: props.mode === "edit" ? props.path?.id ?? "" : "",
    payload,
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
    :title="props.mode === 'create' ? '新建学习路线' : '编辑学习路线'"
    :description="
      props.mode === 'create'
        ? '新建后为「未发布」, 需编排好条目再发布, 用户端才会看到'
        : '只修改路线属性, 不改发布状态 (发布/下架有独立入口)'
    "
    :close-on-backdrop="!props.submitting"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="flex flex-col gap-3">
      <AppInput
        v-model="form.title"
        label="标题"
        required
        :error="errors.title"
        placeholder="学习路线标题 (用户可见)"
      />
      <AppInput
        v-model="form.description"
        label="描述"
        :error="errors.description"
        placeholder="这条路线适合谁 / 学完能到什么程度 (可选)"
      />
      <AppInput
        v-model="form.cover"
        label="封面地址 (cover)"
        :error="errors.cover"
        hint="图片 URL; 留空表示不使用封面"
        placeholder="例如 /learning-path/covers/beginner.svg"
      />
      <AppInput
        v-model="form.order"
        label="排序 (order)"
        :error="errors.order"
        hint="数字越小越靠前 (0 起); 留空表示不修改排序"
        placeholder="0"
      />

      <p
        v-if="props.mode === 'edit' && props.path"
        class="text-xs text-base-content/60"
      >
        当前状态: {{ presentLearningPathPublished(props.path.isPublished).label }} / 条目数:
        {{ props.path.itemCount }} / 更新时间: {{ updatedAtText }}
      </p>
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
