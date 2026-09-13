<script setup lang="ts">
import type { AdminCourseRow } from "~/types/admin";
import type { CourseFormSubmit } from "~/types/ui";

import { reactive, watch } from "vue";

import AppInput from "~/components/form/AppInput.vue";
import AppButton from "~/components/ui/AppButton.vue";
import AppModal from "~/components/ui/AppModal.vue";

/**
 * 课程 新建 / 编辑 表单 (POST /admin/course-packs/:coursePackId/courses、PATCH /admin/courses/:courseId)。
 *
 * order 是课程 DTO 的合法字段 (@IsInt @Min(0)): 留空 = 后端自动排在最后;
 * 排序的上移/下移也走同一条 PATCH {order}, 没有新增任何批量排序接口。
 *
 * 内容改动会触发后端规则: review/published 的包编辑内容后自动退回 draft 重新审核
 * (archived 直接拒绝) —— 页面把这条规则写清楚, 不假装"改了还是发布状态"。
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    mode?: "create" | "edit";
    course?: AdminCourseRow | null;
    submitting?: boolean;
  }>(),
  { mode: "create", course: null, submitting: false },
);

const emit = defineEmits<{
  "update:modelValue": [boolean];
  submit: [CourseFormSubmit];
}>();

interface CourseFormState {
  title: string;
  description: string;
  video: string;
  order: string;
}

const form = reactive<CourseFormState>({ title: "", description: "", video: "", order: "" });
const errors = reactive<Record<keyof CourseFormState, string | null>>({
  title: null,
  description: null,
  video: null,
  order: null,
});

function resetErrors(): void {
  for (const key of Object.keys(errors) as Array<keyof CourseFormState>) {
    errors[key] = null;
  }
}

function fill(): void {
  if (props.mode === "edit" && props.course) {
    form.title = props.course.title;
    form.description = props.course.description;
    form.video = props.course.video;
    form.order = String(props.course.order);
    return;
  }
  form.title = "";
  form.description = "";
  form.video = "";
  form.order = "";
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
  if (!form.title.trim()) errors.title = "课程标题必填";

  if (form.order.trim()) {
    if (!/^\d+$/.test(form.order.trim())) errors.order = "order 必须是非负整数";
  }

  return !errors.title && !errors.order;
}

function onSubmit(): void {
  if (props.submitting) return;
  if (!validate()) return;

  const payload: CourseFormSubmit["payload"] = {
    title: form.title.trim(),
    description: form.description.trim(),
    video: form.video.trim(),
  };
  if (form.order.trim()) payload.order = Number(form.order.trim());

  emit("submit", {
    mode: props.mode,
    courseId: props.mode === "edit" ? props.course?.id ?? "" : "",
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
    :title="props.mode === 'create' ? '新增课程' : '编辑课程'"
    description="课程内容被修改后, 已发布/待审核的课程包会退回草稿并需重新审核 (后端规则)"
    :close-on-backdrop="!props.submitting"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="flex flex-col gap-3">
      <AppInput
        v-model="form.title"
        label="课程标题"
        required
        :error="errors.title"
        placeholder="例如 Lesson 1"
      />
      <AppInput
        v-model="form.description"
        label="课程描述"
        :error="errors.description"
        placeholder="课程简介 (可选)"
      />
      <AppInput
        v-model="form.video"
        label="视频地址 (video)"
        :error="errors.video"
        hint="可选: 课程关联的讲解视频地址"
        placeholder="例如 /videos/lesson-1.mp4"
      />
      <AppInput
        v-model="form.order"
        label="排序 (order)"
        :error="errors.order"
        :hint="props.mode === 'create' ? '留空 = 自动排在最后' : '数字越小越靠前'"
        placeholder="留空自动排序"
      />
      <p
        v-if="props.mode === 'edit' && props.course"
        class="text-xs text-base-content/60"
      >
        当前语句数: {{ props.course.statementCount }}; 排序也可用列表里的上移 / 下移
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
