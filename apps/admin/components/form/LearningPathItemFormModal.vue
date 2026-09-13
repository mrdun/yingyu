<script setup lang="ts">
import type { AdminLearningPathItemRow, CoursePackOption } from "~/types/admin";
import type { LearningPathItemFormSubmit } from "~/types/ui";

import { computed, reactive, watch } from "vue";

import AppInput from "~/components/form/AppInput.vue";
import AppButton from "~/components/ui/AppButton.vue";
import AppModal from "~/components/ui/AppModal.vue";
import { presentCoursePackStatus } from "~/utils/courseStatus";

/**
 * 学习路线 **条目**表单 (阶段 → 课程包 + 排序)。
 *
 * 课程包下拉的数据来自既有课程包列表接口 (见 services/learningPaths.service.ts 的
 * fetchCoursePackOptions), 本批次没有新增任何课程包接口。
 *
 * 后端错误原文 (例如重复添加导致的 409 Conflict) 通过 error 属性原样展示在表单里:
 * 冲突原因由后端给出, 前端不翻译、不吞掉 —— 管理员看到的就是服务器的原话。
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    mode?: "create" | "edit";
    item?: AdminLearningPathItemRow | null;
    coursePackOptions: CoursePackOption[];
    optionsPending?: boolean;
    /** 后端拒绝时的原文 (例如「该课程包已在本学习路线中...」) */
    error?: string | null;
    /** 新建时的默认排序 (通常是 max(order) + 1) */
    defaultOrder?: number;
    submitting?: boolean;
  }>(),
  {
    mode: "create",
    item: null,
    optionsPending: false,
    error: null,
    defaultOrder: 0,
    submitting: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [boolean];
  submit: [LearningPathItemFormSubmit];
}>();

interface ItemFormState {
  coursePackId: string;
  stage: string;
  order: string;
}

const form = reactive<ItemFormState>({
  coursePackId: "",
  stage: "",
  order: "",
});

const errors = reactive<Record<keyof ItemFormState, string | null>>({
  coursePackId: null,
  stage: null,
  order: null,
});

/**
 * 下拉选项: 课程包列表为准。
 * 编辑时若当前条目用的课程包不在选项里 (列表还没加载完 / 正好被过滤掉), 补一条选项,
 * 否则下拉会退化成空值, 保存时可能把课程包改掉。
 */
const options = computed<CoursePackOption[]>(() => {
  const list = props.coursePackOptions;
  const current = props.item;
  if (!current) return list;
  if (list.some((option) => option.id === current.coursePackId)) return list;
  return [
    {
      id: current.coursePackId,
      title: `${current.coursePackTitle} (当前条目)`,
      status: "",
    },
    ...list,
  ];
});

function resetErrors(): void {
  for (const key of Object.keys(errors) as Array<keyof ItemFormState>) {
    errors[key] = null;
  }
}

function fill(): void {
  if (props.mode === "edit" && props.item) {
    form.coursePackId = props.item.coursePackId;
    form.stage = props.item.stage;
    form.order = String(props.item.order);
    return;
  }
  form.coursePackId = "";
  form.stage = "";
  form.order = String(props.defaultOrder);
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
  if (!form.coursePackId) errors.coursePackId = "请选择课程包";

  const raw = form.order.trim();
  if (raw && (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))) {
    errors.order = "排序必须是非负整数";
  }

  return !errors.coursePackId && !errors.order;
}

function onSubmit(): void {
  if (props.submitting) return;
  if (!validate()) return;

  const payload: LearningPathItemFormSubmit["payload"] = {
    coursePackId: form.coursePackId,
    stage: form.stage.trim(),
  };

  const rawOrder = form.order.trim();
  if (rawOrder) payload.order = Number(rawOrder);

  emit("submit", {
    mode: props.mode,
    itemId: props.mode === "edit" ? props.item?.id ?? "" : "",
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
    :title="props.mode === 'create' ? '添加学习路线条目' : '编辑学习路线条目'"
    description="条目 = 学习路线里的一个阶段 + 对应课程包; 顺序决定用户的学习先后"
    :close-on-backdrop="!props.submitting"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="flex flex-col gap-3">
      <label class="form-control w-full">
        <span class="label pb-1 text-xs font-medium text-base-content/70">
          课程包
          <span class="text-error">*</span>
        </span>
        <select
          v-model="form.coursePackId"
          class="select select-bordered select-sm w-full"
          aria-label="课程包"
        >
          <option value="">
            {{ props.optionsPending ? "课程包加载中…" : "请选择课程包" }}
          </option>
          <option
            v-for="option in options"
            :key="option.id"
            :value="option.id"
          >
            {{ option.title }}
            {{ option.status ? `(${presentCoursePackStatus(option.status).label})` : "" }}
          </option>
        </select>
        <span
          v-if="errors.coursePackId"
          class="label pb-0 pt-1 text-xs text-error"
        >
          {{ errors.coursePackId }}
        </span>
        <span
          v-else
          class="label pb-0 pt-1 text-xs text-base-content/60"
        >
          同一条路线里不能重复编排同一个课程包 (后端会拒绝并给出原因)
        </span>
      </label>

      <AppInput
        v-model="form.stage"
        label="阶段名"
        :error="errors.stage"
        hint="例如「入门」「进阶」「实战」; 留空表示不分组"
        placeholder="入门"
      />

      <AppInput
        v-model="form.order"
        label="排序 (order)"
        :error="errors.order"
        hint="数字越小越靠前 (0 起); 列表里也可以用上移/下移调整"
        placeholder="0"
      />

      <p
        v-if="props.error"
        class="alert alert-error text-xs"
        data-testid="learning-path-item-error"
      >
        {{ props.error }}
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
