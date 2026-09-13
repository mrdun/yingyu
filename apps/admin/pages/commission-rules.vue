<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";

import StatusBadge from "~/components/status/StatusBadge.vue";
import DataTable from "~/components/table/DataTable.vue";
import AppInput from "~/components/form/AppInput.vue";
import AppButton from "~/components/ui/AppButton.vue";
import AppConfirmDialog from "~/components/ui/AppConfirmDialog.vue";
import AppEmpty from "~/components/ui/AppEmpty.vue";
import AppError from "~/components/ui/AppError.vue";
import AppLoading from "~/components/ui/AppLoading.vue";
import AppModal from "~/components/ui/AppModal.vue";
import AppPagination from "~/components/ui/AppPagination.vue";
import { useAdminToast } from "~/composables/useAdminToast";
import { useAsyncResource } from "~/composables/useAsyncResource";
import { usePagedList } from "~/composables/usePagedList";
import { useRelogin } from "~/composables/useRelogin";
import { getErrorMessage } from "~/services/admin-api";
import {
  createCommissionRule,
  fetchCommissionRules,
  updateCommissionRule,
} from "~/services/commissionRules.service";
import { fetchPlans } from "~/services/plans.service";
import type { AdminCommissionRule } from "~/types/admin";
import type { TableColumn } from "~/types/ui";
import { formatBps, formatDateTime, parsePercentToBps } from "~/utils/format";
import { presentRuleStatus } from "~/utils/status";

/**
 * 佣金规则 (partner_commission_rules)。
 *
 * 接口: GET /admin/commission-rules、POST /admin/commission-rules、PATCH /admin/commission-rules/:id。
 *
 * 比例以整数 bps 存储: 界面显示与输入都走 utils/format.ts 的 formatBps / parsePercentToBps
 * (唯一的换算入口), 页面里不出现任何写死的比例常量。
 * 规则变更只影响之后的订单: 历史佣金使用生成时的快照, 后端保证, 前端不做任何补偿写入。
 */

const COLUMNS: TableColumn[] = [
  { key: "partnerType", label: "伙伴类型" },
  { key: "plan", label: "适用范围" },
  { key: "percent", label: "佣金比例", align: "right" },
  { key: "status", label: "状态" },
  { key: "effective", label: "生效区间" },
  { key: "createdAt", label: "创建时间" },
  { key: "actions", label: "操作", align: "right" },
];

/** 当前只有 lifetime 一种 Partner 类型 (与后端 PARTNER_TYPE_LIFETIME 一致) */
const PARTNER_TYPE_OPTIONS = [{ value: "lifetime", label: "长期会员 Partner (lifetime)" }];

interface RuleFormState {
  partnerType: string;
  /** 空字符串 = 全局默认规则 (plan_id = null) */
  planId: string;
  /** 界面以百分比输入, 提交前用 parsePercentToBps 换算成 bps */
  percent: string;
  status: string;
}

const rules = useAsyncResource(fetchCommissionRules, {
  isEmpty: (rows) => !Array.isArray(rows) || rows.length === 0,
});
const plans = useAsyncResource(fetchPlans, { isEmpty: () => false });
const toast = useAdminToast();
const relogin = useRelogin();

const rows = computed<AdminCommissionRule[]>(() => rules.data.value ?? []);
const paged = usePagedList(rows, { pageSize: 10 });
const planOptions = computed(() => plans.data.value ?? []);

const formOpen = ref(false);
const formMode = ref<"create" | "edit">("create");
const editingId = ref<string | null>(null);
const submitting = ref(false);
const formError = ref<string | null>(null);

const form = reactive<RuleFormState>({
  partnerType: PARTNER_TYPE_OPTIONS[0]?.value ?? "lifetime",
  planId: "",
  percent: "",
  status: "active",
});

const busyRuleId = ref<string | null>(null);

const confirmOpen = ref(false);
const confirmLoading = ref(false);
const confirmTitle = ref("确认操作");
const confirmMessage = ref("");
const confirmLabel = ref("确认");
const confirmTone = ref<"danger" | "primary">("danger");
let pendingAction: (() => Promise<void>) | null = null;

function scopeLabel(planId: string | null): string {
  if (planId === null) return "全局默认 (所有方案)";
  const plan = planOptions.value.find((item) => item.id === planId);
  return plan ? `${plan.name} (${planId})` : planId;
}

function effectiveLabel(rule: AdminCommissionRule): string {
  const from = formatDateTime(rule.effectiveFrom);
  const to = rule.effectiveTo === null ? "长期有效" : formatDateTime(rule.effectiveTo);
  return `${from} → ${to}`;
}

function openCreate(): void {
  formMode.value = "create";
  editingId.value = null;
  formError.value = null;
  form.partnerType = PARTNER_TYPE_OPTIONS[0]?.value ?? "lifetime";
  form.planId = "";
  form.percent = "";
  form.status = "active";
  formOpen.value = true;
}

function openEdit(rule: AdminCommissionRule): void {
  formMode.value = "edit";
  editingId.value = rule.id;
  formError.value = null;
  form.partnerType = rule.partnerType;
  form.planId = rule.planId ?? "";
  // bps → 百分比只通过 formatBps (去掉百分号后回填输入框)
  form.percent = formatBps(rule.rateBps).replace("%", "");
  form.status = rule.status;
  formOpen.value = true;
}

async function onSubmit(): Promise<void> {
  if (submitting.value) return;
  formError.value = null;

  const rateBps = parsePercentToBps(form.percent);
  if (rateBps === null) {
    formError.value = "请输入有效比例: 百分比数字, 最多两位小数, 范围 0 - 100";
    return;
  }

  submitting.value = true;
  try {
    if (formMode.value === "create") {
      await createCommissionRule({
        partnerType: form.partnerType,
        planId: form.planId ? form.planId : null,
        rateBps,
        status: form.status,
      });
      toast.success("规则已创建", "新规则只影响之后的订单, 历史佣金使用生成时的快照。");
    } else if (editingId.value) {
      await updateCommissionRule(editingId.value, {
        planId: form.planId ? form.planId : null,
        rateBps,
        status: form.status,
      });
      toast.success("规则已更新", "已生成的佣金不受影响, 仍使用原来的比例快照。");
    }
    formOpen.value = false;
    await rules.refresh();
  } catch (error) {
    toast.error("保存失败", getErrorMessage(error));
  } finally {
    submitting.value = false;
  }
}

async function toggleStatus(rule: AdminCommissionRule): Promise<void> {
  busyRuleId.value = rule.id;
  try {
    const nextStatus = rule.status === "active" ? "inactive" : "active";
    await updateCommissionRule(rule.id, { status: nextStatus });
    await rules.refresh();
    toast.success(nextStatus === "active" ? "规则已启用" : "规则已停用");
  } catch (error) {
    toast.error("操作失败", getErrorMessage(error));
  } finally {
    busyRuleId.value = null;
  }
}

function askToggleStatus(rule: AdminCommissionRule): void {
  const label = rule.status === "active" ? "停用" : "启用";
  confirmTitle.value = `${label}佣金规则`;
  confirmMessage.value =
    rule.status === "active"
      ? `停用后「${scopeLabel(rule.planId)}」不再参与佣金计算 (新订单不会生成佣金)。` +
        `已生成的佣金记录不受影响。确认停用?`
      : `启用后「${scopeLabel(rule.planId)}」按 ${formatBps(rule.rateBps)} 参与之后的佣金计算。确认启用?`;
  confirmLabel.value = label;
  confirmTone.value = rule.status === "active" ? "danger" : "primary";
  pendingAction = () => toggleStatus(rule);
  confirmOpen.value = true;
}

async function runPendingAction(): Promise<void> {
  if (!pendingAction || confirmLoading.value) return;
  confirmLoading.value = true;
  try {
    await pendingAction();
  } finally {
    confirmLoading.value = false;
    confirmOpen.value = false;
    pendingAction = null;
  }
}

// 方案列表变化时收敛已选方案 (方案被删除/隐藏时不留下悬空选择)
watch(planOptions, (options) => {
  if (!form.planId) return;
  if (!options.some((plan) => plan.id === form.planId)) form.planId = "";
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-xs text-base-content/60">
        数据来源: GET /admin/commission-rules。比例以 bps 存储, 界面统一由 utils/format.ts
        换算为百分比 (例如 2500 bps 显示为 25%)。
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <AppButton
          size="sm"
          variant="outline"
          :loading="rules.pending.value"
          @click="rules.refresh"
        >
          刷新
        </AppButton>
        <AppButton
          size="sm"
          @click="openCreate"
        >
          新建规则
        </AppButton>
      </div>
    </div>

    <div class="overflow-hidden rounded-box border border-base-300 bg-base-100">
      <AppLoading
        v-if="rules.pending.value && !rules.data.value"
        label="正在加载佣金规则"
      />
      <AppError
        v-else-if="rules.errorMessage.value"
        title="佣金规则加载失败"
        :message="rules.errorMessage.value"
        :status-code="rules.statusCode.value"
        :show-sign-in="rules.unauthenticated.value"
        @retry="rules.refresh"
        @sign-in="relogin"
      />
      <AppEmpty
        v-else-if="rules.isEmpty.value"
        title="还没有佣金规则"
        description="没有生效规则时, 后端不会为订单生成佣金 (不会套用默认比例)。请先新建规则。"
      >
        <AppButton
          size="sm"
          class="mt-2"
          @click="openCreate"
        >
          新建规则
        </AppButton>
      </AppEmpty>
      <DataTable
        v-else
        :columns="COLUMNS"
      >
        <tr
          v-for="rule in paged.items.value"
          :key="rule.id"
          class="hover"
        >
          <td class="text-xs">{{ rule.partnerType }}</td>
          <td class="text-xs">{{ scopeLabel(rule.planId) }}</td>
          <td class="text-right text-sm tabular-nums">{{ formatBps(rule.rateBps) }}</td>
          <td>
            <StatusBadge
              :label="presentRuleStatus(rule.status).label"
              :tone="presentRuleStatus(rule.status).tone"
            />
          </td>
          <td class="text-xs text-base-content/60">{{ effectiveLabel(rule) }}</td>
          <td class="text-xs text-base-content/60">{{ formatDateTime(rule.createdAt) }}</td>
          <td>
            <div class="flex items-center justify-end gap-1">
              <AppButton
                size="sm"
                variant="outline"
                :disabled="busyRuleId === rule.id"
                @click="openEdit(rule)"
              >
                编辑
              </AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                :disabled="busyRuleId === rule.id"
                @click="askToggleStatus(rule)"
              >
                {{ rule.status === "active" ? "停用" : "启用" }}
              </AppButton>
            </div>
          </td>
        </tr>
      </DataTable>
      <AppPagination
        v-if="!rules.pending.value && !rules.errorMessage.value && !rules.isEmpty.value"
        :page="paged.page.value"
        :total-pages="paged.totalPages.value"
        :total="paged.total.value"
        :page-size="paged.pageSize.value"
        @update:page="paged.setPage"
      />
    </div>

    <AppModal
      v-model="formOpen"
      :title="formMode === 'create' ? '新建佣金规则' : '编辑佣金规则'"
      description="比例以百分比输入, 提交前通过 parsePercentToBps 换算为整数 bps"
    >
      <div class="flex flex-col gap-3">
        <label class="form-control w-full">
          <span class="label pb-1 text-xs font-medium text-base-content/70">伙伴类型</span>
          <select
            v-model="form.partnerType"
            class="select select-bordered select-sm w-full"
            aria-label="伙伴类型"
            :disabled="formMode === 'edit'"
          >
            <option
              v-for="option in PARTNER_TYPE_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>

        <label class="form-control w-full">
          <span class="label pb-1 text-xs font-medium text-base-content/70">适用范围</span>
          <select
            v-model="form.planId"
            class="select select-bordered select-sm w-full"
            aria-label="适用范围"
          >
            <option value="">全局默认 (所有方案)</option>
            <option
              v-for="plan in planOptions"
              :key="plan.id"
              :value="plan.id"
            >
              {{ plan.name }} ({{ plan.id }})
            </option>
          </select>
        </label>

        <AppInput
          v-model="form.percent"
          label="佣金比例 (百分比)"
          required
          placeholder="输入百分比数字, 最多两位小数"
          hint="提交前自动换算为 bps, 例如 25 表示 25%"
        />

        <label class="form-control w-full">
          <span class="label pb-1 text-xs font-medium text-base-content/70">状态</span>
          <select
            v-model="form.status"
            class="select select-bordered select-sm w-full"
            aria-label="规则状态"
          >
            <option value="active">已启用</option>
            <option value="inactive">已停用</option>
          </select>
        </label>

        <p
          v-if="formError"
          class="text-xs text-error"
        >
          {{ formError }}
        </p>
        <p class="text-xs text-base-content/50">
          规则修改只影响之后的订单: 已生成的佣金保留支付时的比例快照, 后台不会回写历史记录。
        </p>
      </div>
      <template #footer>
        <AppButton
          size="sm"
          variant="ghost"
          :disabled="submitting"
          @click="formOpen = false"
        >
          取消
        </AppButton>
        <AppButton
          size="sm"
          :loading="submitting"
          @click="onSubmit"
        >
          保存
        </AppButton>
      </template>
    </AppModal>

    <AppConfirmDialog
      v-model="confirmOpen"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirm-label="confirmLabel"
      :tone="confirmTone"
      :loading="confirmLoading"
      @confirm="runPendingAction"
    />
  </div>
</template>
