<script setup lang="ts">
import { computed, ref } from "vue";

import PlanFormModal from "~/components/form/PlanFormModal.vue";
import StatusBadge from "~/components/status/StatusBadge.vue";
import DataTable from "~/components/table/DataTable.vue";
import AppButton from "~/components/ui/AppButton.vue";
import AppConfirmDialog from "~/components/ui/AppConfirmDialog.vue";
import AppEmpty from "~/components/ui/AppEmpty.vue";
import AppError from "~/components/ui/AppError.vue";
import AppLoading from "~/components/ui/AppLoading.vue";
import AppPagination from "~/components/ui/AppPagination.vue";
import { useAdminToast } from "~/composables/useAdminToast";
import { useAsyncResource } from "~/composables/useAsyncResource";
import { usePagedList } from "~/composables/usePagedList";
import { useRelogin } from "~/composables/useRelogin";
import { getErrorMessage } from "~/services/admin-api";
import {
  buildReorderPayloads,
  createPlan,
  deletePlan,
  fetchPlans,
  fetchPlansHealth,
  updatePlan,
} from "~/services/plans.service";
import type { AdminPlanRow } from "~/types/admin";
import type { PlanFormSubmit, TableColumn } from "~/types/ui";
import { formatDateTime, formatDurationDays, formatYuanFromFen } from "~/utils/format";
import { presentPlanVisibility } from "~/utils/status";

/**
 * 会员方案管理 (GET/POST/PATCH/DELETE /admin/plans + GET /admin/plans/health)。
 *
 * 价格永远来自接口返回值 (priceFen → 元展示), 页面里不存在任何硬编码金额。
 * 价格/上下架/排序都会直接影响商城与收入, 因此危险动作 (删除 / 停用) 一律二次确认。
 */

const COLUMNS: TableColumn[] = [
  { key: "name", label: "方案名称" },
  { key: "id", label: "方案 ID" },
  { key: "price", label: "价格", align: "right" },
  { key: "duration", label: "周期" },
  { key: "sortOrder", label: "排序", align: "right" },
  { key: "status", label: "状态" },
  { key: "updatedAt", label: "更新时间" },
  { key: "actions", label: "操作", align: "right" },
];

const plans = useAsyncResource(fetchPlans, { isEmpty: (rows) => rows.length === 0 });
const health = useAsyncResource(fetchPlansHealth);
const toast = useAdminToast();
const relogin = useRelogin();

const rows = computed<AdminPlanRow[]>(() => plans.data.value ?? []);
const paged = usePagedList(rows);

const formOpen = ref(false);
const formMode = ref<"create" | "edit">("create");
const editingPlan = ref<AdminPlanRow | null>(null);
const submitting = ref(false);

const confirmOpen = ref(false);
const confirmLoading = ref(false);
const confirmTitle = ref("确认操作");
const confirmMessage = ref("");
const confirmLabel = ref("确认");
const confirmTone = ref<"danger" | "primary">("danger");
let pendingAction: (() => Promise<void>) | null = null;

/** 行内正在处理的操作 (避免连点导致重复 PATCH) */
const busyPlanId = ref<string | null>(null);

async function refreshAll(): Promise<void> {
  await Promise.all([plans.refresh(), health.refresh()]);
}

function askConfirm(options: {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  action: () => Promise<void>;
}): void {
  confirmTitle.value = options.title;
  confirmMessage.value = options.message;
  confirmLabel.value = options.confirmLabel;
  confirmTone.value = options.tone ?? "danger";
  pendingAction = options.action;
  confirmOpen.value = true;
}

async function runPendingAction(): Promise<void> {
  if (!pendingAction || confirmLoading.value) return;
  confirmLoading.value = true;
  try {
    await pendingAction();
    await refreshAll();
    toast.success("操作成功");
  } catch (error) {
    toast.error("操作失败", getErrorMessage(error));
  } finally {
    confirmLoading.value = false;
    confirmOpen.value = false;
    pendingAction = null;
  }
}

function openCreate(): void {
  formMode.value = "create";
  editingPlan.value = null;
  formOpen.value = true;
}

function openEdit(plan: AdminPlanRow): void {
  formMode.value = "edit";
  editingPlan.value = plan;
  formOpen.value = true;
}

async function onSubmitForm(submit: PlanFormSubmit): Promise<void> {
  submitting.value = true;
  try {
    if (submit.mode === "create") {
      const { name, priceFen } = submit.payload;
      if (!submit.id || !name || typeof priceFen !== "number") {
        throw new Error("方案 ID / 名称 / 价格 均为必填");
      }
      await createPlan({
        id: submit.id,
        name,
        priceFen,
        durationDays: submit.payload.durationDays ?? null,
        sortOrder: submit.payload.sortOrder,
        isActive: submit.payload.isActive,
        isPublic: submit.payload.isPublic,
      });
      toast.success("方案已创建");
    } else {
      await updatePlan(submit.id, submit.payload);
      toast.success("方案已更新");
    }
    formOpen.value = false;
    await refreshAll();
  } catch (error) {
    toast.error("保存失败", getErrorMessage(error));
  } finally {
    submitting.value = false;
  }
}

async function toggleActive(plan: AdminPlanRow): Promise<void> {
  busyPlanId.value = plan.id;
  try {
    await updatePlan(plan.id, { isActive: !plan.isActive });
    await refreshAll();
    toast.success(plan.isActive ? "方案已停用" : "方案已启用");
  } catch (error) {
    toast.error("操作失败", getErrorMessage(error));
  } finally {
    busyPlanId.value = null;
  }
}

function askToggleActive(plan: AdminPlanRow): void {
  const action = plan.isActive ? "停用" : "启用";
  askConfirm({
    title: `${action}方案`,
    message: plan.isActive
      ? `停用后「${plan.name}」将不再对用户售卖, 已购买用户的权益不受影响。确认停用?`
      : `启用后「${plan.name}」将按当前价格与上下架设置对外生效。确认启用?`,
    confirmLabel: action,
    tone: plan.isActive ? "danger" : "primary",
    action: () => toggleActive(plan),
  });
}

function askDelete(plan: AdminPlanRow): void {
  askConfirm({
    title: "删除会员方案",
    message:
      `确认删除「${plan.name}」? 该操作不可撤销。` +
      `若该方案已产生订单或会员记录, 后端会拒绝删除 —— 这时请改为停用。`,
    confirmLabel: "删除",
    tone: "danger",
    action: async () => {
      await deletePlan(plan.id);
    },
  });
}

async function move(plan: AdminPlanRow, direction: -1 | 1): Promise<void> {
  const index = rows.value.findIndex((item) => item.id === plan.id);
  const payloads = buildReorderPayloads(rows.value, index, direction);
  if (!payloads) {
    toast.info(direction < 0 ? "已经是第一个方案" : "已经是最后一个方案");
    return;
  }

  busyPlanId.value = plan.id;
  try {
    for (const change of payloads) {
      await updatePlan(change.id, { sortOrder: change.sortOrder });
    }
    await refreshAll();
    toast.success("排序已更新");
  } catch (error) {
    toast.error("排序失败", getErrorMessage(error));
  } finally {
    busyPlanId.value = null;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <StatusBadge
          v-if="health.data.value"
          :label="health.data.value.ok ? '商业化检查通过' : '存在告警'"
          :tone="health.data.value.ok ? 'success' : 'warning'"
        />
        <span
          v-if="health.data.value"
          class="text-xs text-base-content/60"
        >
          方案 {{ health.data.value.plansTotal }} 个 / 在售
          {{ health.data.value.purchasablePlans }} 个
        </span>
      </div>
      <div class="flex items-center gap-2">
        <AppButton
          size="sm"
          variant="outline"
          :loading="plans.pending.value"
          @click="refreshAll"
        >
          刷新
        </AppButton>
        <AppButton
          size="sm"
          @click="openCreate"
        >
          新建方案
        </AppButton>
      </div>
    </div>

    <div
      v-if="health.data.value && health.data.value.warnings.length > 0"
      class="alert alert-warning text-xs"
    >
      <ul class="flex flex-col gap-1">
        <li
          v-for="warning in health.data.value.warnings"
          :key="warning"
        >
          {{ warning }}
        </li>
      </ul>
    </div>

    <div class="overflow-hidden rounded-box border border-base-300 bg-base-100">
      <AppLoading
        v-if="plans.pending.value && !plans.data.value"
        label="正在加载会员方案"
      />
      <AppError
        v-else-if="plans.errorMessage.value"
        title="会员方案加载失败"
        :message="plans.errorMessage.value"
        :status-code="plans.statusCode.value"
        :show-sign-in="plans.unauthenticated.value"
        @retry="plans.refresh"
        @sign-in="relogin"
      />
      <AppEmpty
        v-else-if="plans.isEmpty.value"
        title="还没有会员方案"
        description="商城当前没有可售商品, 请先新建一个方案。"
      >
        <AppButton
          size="sm"
          class="mt-2"
          @click="openCreate"
        >
          新建方案
        </AppButton>
      </AppEmpty>
      <DataTable
        v-else
        :columns="COLUMNS"
      >
        <tr
          v-for="(plan, index) in paged.items.value"
          :key="plan.id"
          class="hover"
        >
          <td class="text-sm font-medium">{{ plan.name }}</td>
          <td class="font-mono text-xs text-base-content/70">{{ plan.id }}</td>
          <td class="text-right text-sm tabular-nums">
            {{ formatYuanFromFen(plan.priceFen) }}
          </td>
          <td class="text-xs">{{ formatDurationDays(plan.durationDays) }}</td>
          <td class="text-right text-xs tabular-nums">{{ plan.sortOrder }}</td>
          <td>
            <StatusBadge
              :label="presentPlanVisibility(plan.isActive, plan.isPublic).label"
              :tone="presentPlanVisibility(plan.isActive, plan.isPublic).tone"
            />
          </td>
          <td class="text-xs text-base-content/60">{{ formatDateTime(plan.updatedAt) }}</td>
          <td>
            <div class="flex items-center justify-end gap-1">
              <AppButton
                size="sm"
                variant="ghost"
                :disabled="index === 0 || busyPlanId === plan.id"
                @click="move(plan, -1)"
              >
                上移
              </AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                :disabled="index === paged.items.value.length - 1 || busyPlanId === plan.id"
                @click="move(plan, 1)"
              >
                下移
              </AppButton>
              <AppButton
                size="sm"
                variant="outline"
                :disabled="busyPlanId === plan.id"
                @click="openEdit(plan)"
              >
                编辑
              </AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                :disabled="busyPlanId === plan.id"
                @click="askToggleActive(plan)"
              >
                {{ plan.isActive ? "停用" : "启用" }}
              </AppButton>
              <AppButton
                size="sm"
                variant="danger"
                :disabled="busyPlanId === plan.id"
                @click="askDelete(plan)"
              >
                删除
              </AppButton>
            </div>
          </td>
        </tr>
      </DataTable>
      <AppPagination
        v-if="!plans.pending.value && !plans.errorMessage.value && !plans.isEmpty.value"
        :page="paged.page.value"
        :total-pages="paged.totalPages.value"
        :total="paged.total.value"
        :page-size="paged.pageSize.value"
        @update:page="paged.setPage"
      />
    </div>

    <PlanFormModal
      v-model="formOpen"
      :mode="formMode"
      :plan="editingPlan"
      :submitting="submitting"
      @submit="onSubmitForm"
    />

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
