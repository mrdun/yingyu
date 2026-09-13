<script setup lang="ts">
import type { AdminCoursePackDetail } from "~/types/admin";
import type { CoursePackFormSubmit } from "~/types/ui";

import { reactive, ref, watch } from "vue";

import AppInput from "~/components/form/AppInput.vue";
import AppButton from "~/components/ui/AppButton.vue";
import AppModal from "~/components/ui/AppModal.vue";
import { presentCoursePackStatus } from "~/utils/courseStatus";
import { formatDateTime } from "~/utils/format";

/**
 * 课程包 新建 / 编辑 表单。
 *
 * 新建: title(必填) / description / cover / accessLevel —— 后端固定写成 draft + manual。
 * 编辑: title / description / cover / order —— order 是 PATCH /admin/course-packs/:id 的合法字段
 *   (UpdateCoursePackDto: @IsOptional @IsInt @Min(0)), 与课程/语句排序走同一条单条 PATCH,
 *   没有任何批量排序接口。
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    mode?: "create" | "edit";
    pack?: AdminCoursePackDetail | null;
    submitting?: boolean;
  }>(),
  { mode: "create", pack: null, submitting: false },
);

const emit = defineEmits<{
  "update:modelValue": [boolean];
  submit: [CoursePackFormSubmit];
}>();

interface CoursePackFormState {
  title: string;
  description: string;
  cover: string;
  accessLevel: "free" | "membership";
  order: string;
}

const form = reactive<CoursePackFormState>({
  title: "",
  description: "",
  cover: "",
  accessLevel: "membership",
  order: "",
});

const errors = reactive<Record<keyof CoursePackFormState, string | null>>({
  title: null,
  description: null,
  cover: null,
  accessLevel: null,
  order: null,
});

const updatedAtText = ref("");

function resetErrors(): void {
  for (const key of Object.keys(errors) as Array<keyof CoursePackFormState>) {
    errors[key] = null;
  }
}

function fill(): void {
  if (props.mode === "edit" && props.pack) {
    form.title = props.pack.title;
    form.description = props.pack.description;
    form.cover = props.pack.cover ?? "";
    form.accessLevel = props.pack.accessLevel === "free" ? "free" : "membership";
    form.order = String(props.pack.order);
    updatedAtText.value = formatDateTime(props.pack.updatedAt);
    return;
  }
  form.title = "";
  form.description = "";
  form.cover = "";
  form.accessLevel = "membership";
  // 新建不提交 order: CreateCoursePackDto 不接受它, 后端固定写 0 (排在最后)
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
  // 编辑时 order 必填 (打开表单即带上当前值), 并和课程/语句一样只接受非负整数
  if (props.mode === "edit") {
    const raw = form.order.trim();
    if (!raw) errors.order = "排序不能留空";
    else if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))
      errors.order = "order 必须是非负整数";
  }
  return !errors.title && !errors.order;
}

function onSubmit(): void {
  if (props.submitting) return;
  if (!validate()) return;

  const payload: CoursePackFormSubmit["payload"] = {
    title: form.title.trim(),
    description: form.description.trim(),
    cover: form.cover.trim(),
  };

  // 访问级别只在新建时随表单提交; 编辑时不在这里改 (避免与列表页的二次确认入口不一致)
  if (props.mode === "create") {
    payload.accessLevel = form.accessLevel;
  } else {
    // 编辑: 提交 order 即排序 (校验保证是非负整数)
    payload.order = Number(form.order.trim());
  }

  emit("submit", {
    mode: props.mode,
    id: props.mode === "edit" ? props.pack?.id ?? "" : "",
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
    :title="props.mode === 'create' ? '新建课程包' : '编辑课程包'"
    :description="
      props.mode === 'create'
        ? '新建后状态为草稿 (draft)、来源为手工创建 (manual), 需提交审核后才能发布'
        : '只修改课程包属性, 不改状态; 修改课程/语句内容会让已发布的包退回草稿待重新审核'
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
        placeholder="课程包标题 (用户可见)"
      />
      <AppInput
        v-model="form.description"
        label="描述"
        :error="errors.description"
        placeholder="课程包简介 (可选)"
      />
      <AppInput
        v-model="form.cover"
        label="封面地址 (cover)"
        :error="errors.cover"
        hint="图片 URL; 留空表示不使用封面"
        placeholder="例如 /course-covers/cover-1.svg"
      />

      <label
        v-if="props.mode === 'create'"
        class="form-control w-full"
      >
        <span class="label pb-1 text-xs font-medium text-base-content/70">访问级别</span>
        <select
          v-model="form.accessLevel"
          class="select select-bordered select-sm w-full"
          aria-label="访问级别"
        >
          <option value="membership">会员 (membership)</option>
          <option value="free">免费 (free)</option>
        </select>
      </label>

      <AppInput
        v-else
        v-model="form.order"
        label="排序 (order)"
        required
        :error="errors.order"
        hint="数字越小越靠前 (0 起); 与课程/语句排序同一条 PATCH"
        placeholder="0"
      />

      <p
        v-if="props.mode === 'edit' && props.pack"
        class="text-xs text-base-content/60"
      >
        当前状态: {{ presentCoursePackStatus(props.pack.status).label }} / 更新时间:
        {{ updatedAtText }}
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
