<script setup lang="ts">
import { reactive, ref, watch } from "vue";

import AppButton from "~/components/ui/AppButton.vue";
import AppInput from "~/components/form/AppInput.vue";
import AppModal from "~/components/ui/AppModal.vue";
import AppSwitch from "~/components/form/AppSwitch.vue";
import type { AdminPlanPayload, AdminPlanRow } from "~/types/admin";
import type { PlanFormSubmit } from "~/types/ui";
import { fenToYuanInput, yuanInputToFen } from "~/utils/format";

/**
 * 会员方案 新建 / 编辑 表单。
 *
 * 硬约束: 价格一律来自 API 数据 (编辑时用 plan.priceFen 回填, 新建时由管理员输入),
 * 组件里不出现任何具体金额常量。
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    mode?: "create" | "edit";
    plan?: AdminPlanRow | null;
    submitting?: boolean;
  }>(),
  { mode: "create", plan: null, submitting: false },
);

const emit = defineEmits<{
  "update:modelValue": [boolean];
  submit: [PlanFormSubmit];
}>();

interface PlanFormState {
  id: string;
  name: string;
  /** 表单以「元」输入, 提交前换算成「分」 */
  priceYuan: string;
  /** 留空 = 长期有效 (后端 durationDays: null) */
  durationDays: string;
  sortOrder: string;
  isActive: boolean;
  isPublic: boolean;
}

const form = reactive<PlanFormState>({
  id: "",
  name: "",
  priceYuan: "",
  durationDays: "",
  sortOrder: "0",
  isActive: true,
  isPublic: true,
});

const errors = reactive<Record<keyof PlanFormState, string | null>>({
  id: null,
  name: null,
  priceYuan: null,
  durationDays: null,
  sortOrder: null,
  isActive: null,
  isPublic: null,
});

const canEditId = ref(true);

function resetErrors(): void {
  for (const key of Object.keys(errors) as Array<keyof PlanFormState>) {
    errors[key] = null;
  }
}

function fillFromPlan(plan: AdminPlanRow | null): void {
  if (!plan) {
    form.id = "";
    form.name = "";
    form.priceYuan = "";
    form.durationDays = "";
    form.sortOrder = "0";
    form.isActive = true;
    form.isPublic = true;
    canEditId.value = true;
    return;
  }
  form.id = plan.id;
  form.name = plan.name;
  form.priceYuan = fenToYuanInput(plan.priceFen);
  form.durationDays = plan.durationDays === null ? "" : String(plan.durationDays);
  form.sortOrder = String(plan.sortOrder ?? 0);
  form.isActive = plan.isActive;
  form.isPublic = plan.isPublic;
  // 后端 id 是主键, 编辑时不可改
  canEditId.value = false;
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    resetErrors();
    fillFromPlan(props.mode === "edit" ? props.plan : null);
  },
);

function parseDurationDays(): { value: number | null; error: string | null } {
  const raw = form.durationDays.trim();
  if (!raw) return { value: null, error: null };
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return { value: null, error: "周期必须是正整数天数, 或留空表示长期有效" };
  }
  return { value: parsed, error: null };
}

function validate(): boolean {
  resetErrors();

  if (props.mode === "create") {
    const id = form.id.trim();
    if (!id) {
      errors.id = "方案 ID 必填 (创建后不可修改)";
    } else if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      errors.id = "方案 ID 只能包含字母、数字、下划线和连字符";
    }
  }

  if (!form.name.trim()) errors.name = "方案名称必填";

  const priceFen = yuanInputToFen(form.priceYuan);
  if (priceFen === null) errors.priceYuan = "请输入有效价格 (以元为单位, 最多两位小数)";

  const duration = parseDurationDays();
  errors.durationDays = duration.error;

  const sortOrder = Number(form.sortOrder.trim() || "0");
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    errors.sortOrder = "排序必须是不小于 0 的整数";
  }

  return Object.values(errors).every((message) => !message);
}

function onSubmit(): void {
  if (props.submitting) return;
  if (!validate()) return;

  const priceFen = yuanInputToFen(form.priceYuan);
  if (priceFen === null) return;

  const payload: AdminPlanPayload = {
    name: form.name.trim(),
    priceFen,
    durationDays: parseDurationDays().value,
    sortOrder: Number(form.sortOrder.trim() || "0"),
    isActive: form.isActive,
    isPublic: form.isPublic,
  };

  emit("submit", {
    mode: props.mode,
    id: form.id.trim(),
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
    :title="props.mode === 'create' ? '新建会员方案' : '编辑会员方案'"
    description="价格与周期都会写入后端 plans 表, 商城/会员页立即以这里的数据为准"
    :close-on-backdrop="!props.submitting"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
      <AppInput
        v-model="form.id"
        label="方案 ID"
        :required="props.mode === 'create'"
        :readonly="!canEditId"
        :disabled="props.mode === 'edit'"
        :error="errors.id"
        hint="后端主键, 创建后不可修改"
        placeholder="例如 lifetime"
      />
      <AppInput
        v-model="form.name"
        label="方案名称"
        required
        :error="errors.name"
        placeholder="展示给用户的名称"
      />
      <AppInput
        v-model="form.priceYuan"
        label="价格 (元)"
        required
        :error="errors.priceYuan"
        hint="提交时换算为「分」传给后端"
        placeholder="以元为单位, 最多两位小数"
      />
      <AppInput
        v-model="form.durationDays"
        label="有效天数"
        :error="errors.durationDays"
        hint="留空表示长期有效"
        placeholder="留空 = 长期有效"
      />
      <AppInput
        v-model="form.sortOrder"
        label="排序"
        :error="errors.sortOrder"
        hint="数字越小越靠前"
      />
      <div class="flex items-end gap-4 pb-1">
        <AppSwitch
          v-model="form.isActive"
          label="启用 (isActive)"
        />
        <AppSwitch
          v-model="form.isPublic"
          label="公开销售 (isPublic)"
        />
      </div>
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
