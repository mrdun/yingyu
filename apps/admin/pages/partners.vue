<script setup lang="ts">
import { computed, ref } from "vue";

import StatusBadge from "~/components/status/StatusBadge.vue";
import DataTable from "~/components/table/DataTable.vue";
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
import { fetchCommissionRules } from "~/services/commissionRules.service";
import { applyPartnerAction, fetchPartner, fetchPartners } from "~/services/partners.service";
import type { PartnerAction } from "~/services/partners.service";
import type { AdminPartnerRow, PartnerStatusValue } from "~/types/admin";
import type { TableColumn } from "~/types/ui";
import { MISSING_TEXT, formatBps, formatDateTime } from "~/utils/format";
import { presentPartnerStatus } from "~/utils/status";

/**
 * 推广伙伴 (Partner)。
 *
 * 接口: GET /admin/partners、GET /admin/partners/:id、
 *       POST /admin/partners/:id/{approve,reject,suspend,activate}、GET /admin/commission-rules。
 *
 * 佣金比例不在 Partner 记录上 (后端已剔除旧字段), 本页只读展示「全局默认佣金规则」,
 * 规则明细与修改在「佣金规则」页 —— 前端不换算、不推断任何比例。
 * 四个状态动作都会影响推广资格与结算关系, 全部二次确认。
 */

const COLUMNS: TableColumn[] = [
  { key: "referralCode", label: "推荐码" },
  { key: "userId", label: "用户 ID" },
  { key: "status", label: "状态" },
  { key: "createdAt", label: "创建时间" },
  { key: "commission", label: "佣金规则" },
  { key: "actions", label: "操作", align: "right" },
];

/** 状态过滤 (后端列表接口无 status 参数, 因此这里是前端筛选, 不改动数据) */
const STATUS_OPTIONS: PartnerStatusValue[] = ["pending", "active", "suspended", "rejected"];

/**
 * 每个状态下后端允许的动作 (与 partner-status.ts 的状态机一致)。
 * 这只是按钮显隐, 后端仍然是最终裁判: 非法动作会返回错误并由 toast 提示。
 */
const ACTIONS_BY_STATUS: Record<string, PartnerAction[]> = {
  pending: ["approve", "reject"],
  active: ["suspend"],
  suspended: ["activate"],
  rejected: [],
};

const ACTION_LABELS: Record<PartnerAction, string> = {
  approve: "通过审核",
  reject: "拒绝申请",
  suspend: "暂停推广",
  activate: "恢复推广",
};

const partners = useAsyncResource(fetchPartners, {
  isEmpty: (rows) => !Array.isArray(rows) || rows.length === 0,
});
const rules = useAsyncResource(fetchCommissionRules, { isEmpty: () => false });
const toast = useAdminToast();
const relogin = useRelogin();

const statusFilter = ref("");
const filtered = computed<AdminPartnerRow[]>(() => {
  const rows = partners.data.value ?? [];
  if (!statusFilter.value) return rows;
  return rows.filter((row) => row.status === statusFilter.value);
});
const paged = usePagedList(filtered, { pageSize: 10 });

/** 全局默认规则 (planId = null 且 active), 后端按创建时间倒序返回 */
const globalRule = computed(
  () => rules.data.value?.find((rule) => rule.planId === null && rule.status === "active") ?? null,
);

const detailOpen = ref(false);
const selectedId = ref<string | null>(null);

function fetchPartnerById(): Promise<AdminPartnerRow> {
  const id = selectedId.value;
  if (!id) throw new Error("未选择 Partner");
  return fetchPartner(id);
}

const detail = useAsyncResource(fetchPartnerById, {
  immediate: false,
  isEmpty: () => false,
});

const detailView = computed(() => {
  const row = detail.data.value;
  return {
    id: row?.id ?? MISSING_TEXT,
    userId: row?.userId ?? MISSING_TEXT,
    referralCode: row?.referralCode ?? null,
    status: row?.status ?? null,
    createdAt: row?.createdAt ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
});

const confirmOpen = ref(false);
const confirmLoading = ref(false);
const confirmTitle = ref("确认操作");
const confirmMessage = ref("");
const confirmLabel = ref("确认");
const confirmTone = ref<"danger" | "primary">("danger");
let pendingAction: (() => Promise<void>) | null = null;

/** 行内正在处理的动作, 避免连点重复提交 */
const busyId = ref<string | null>(null);

function actionsFor(status: string | null | undefined): PartnerAction[] {
  return (status && ACTIONS_BY_STATUS[status]) || [];
}

async function openDetail(row: AdminPartnerRow): Promise<void> {
  selectedId.value = row.id;
  detailOpen.value = true;
  await detail.load();
}

function describeAction(action: PartnerAction, row: AdminPartnerRow): string {
  const code = row.referralCode ?? MISSING_TEXT;
  if (action === "approve") {
    return `通过后 Partner ${row.userId} (推荐码 ${code}) 可以开始推广并产生佣金规则内的佣金。确认通过?`;
  }
  if (action === "reject") {
    return `拒绝后 Partner ${row.userId} 不能推广, 该申请不可再次进入审核流程。确认拒绝?`;
  }
  if (action === "suspend") {
    return `暂停后 Partner ${row.userId} 的推荐链接不再归因, 已有佣金记录不受影响。确认暂停?`;
  }
  return `恢复后 Partner ${row.userId} 可以继续推广, 佣金按当前生效规则计算。确认恢复?`;
}

async function applyAction(row: AdminPartnerRow, action: PartnerAction): Promise<void> {
  busyId.value = row.id;
  try {
    await applyPartnerAction(row.id, action);
    await partners.refresh();
    if (detailOpen.value && selectedId.value === row.id) {
      await detail.load();
    }
    toast.success("操作已完成", "Partner 状态以接口返回为准。");
  } catch (error) {
    toast.error("操作失败", getErrorMessage(error));
  } finally {
    busyId.value = null;
  }
}

function askAction(row: AdminPartnerRow, action: PartnerAction): void {
  confirmTitle.value = ACTION_LABELS[action];
  confirmMessage.value = describeAction(action, row);
  confirmLabel.value = ACTION_LABELS[action];
  confirmTone.value = action === "approve" || action === "activate" ? "primary" : "danger";
  pendingAction = () => applyAction(row, action);
  confirmOpen.value = true;
}

function askActionForDetail(action: PartnerAction): void {
  const fromList = (partners.data.value ?? []).find((row) => row.id === selectedId.value);
  const row = fromList ?? null;
  if (!row) {
    toast.error("无法执行操作", "列表中已找不到该 Partner, 请刷新后重试。");
    return;
  }
  askAction(row, action);
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

function actionTone(action: PartnerAction): "primary" | "danger" | "ghost" {
  if (action === "reject" || action === "suspend") return "danger";
  if (action === "approve" || action === "activate") return "primary";
  return "ghost";
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-xs text-base-content/60">
        数据来源: GET /admin/partners + GET /admin/commission-rules。 Partner
        记录上不再保存佣金比例, 比例统一以佣金规则为准。
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <select
          v-model="statusFilter"
          class="select select-bordered select-sm w-36"
          aria-label="按状态过滤"
        >
          <option value="">全部状态</option>
          <option
            v-for="status in STATUS_OPTIONS"
            :key="status"
            :value="status"
          >
            {{ presentPartnerStatus(status).label }}
          </option>
        </select>
        <AppButton
          size="sm"
          variant="outline"
          :loading="partners.pending.value"
          @click="partners.refresh"
        >
          刷新
        </AppButton>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2 text-xs">
      <StatusBadge
        label="全局默认佣金规则"
        tone="neutral"
      />
      <span
        v-if="globalRule"
        class="font-medium tabular-nums"
      >
        {{ formatBps(globalRule.rateBps) }}
      </span>
      <span
        v-else-if="rules.errorMessage.value"
        class="text-error"
      >
        规则加载失败: {{ rules.errorMessage.value }}
      </span>
      <span
        v-else
        class="text-base-content/50"
      >
        {{ rules.pending.value ? "加载中" : "未配置全局默认规则 (见「佣金规则」页)" }}
      </span>
    </div>

    <div class="overflow-hidden rounded-box border border-base-300 bg-base-100">
      <AppLoading
        v-if="partners.pending.value && !partners.data.value"
        label="正在加载 Partner 列表"
      />
      <AppError
        v-else-if="partners.errorMessage.value"
        title="Partner 列表加载失败"
        :message="partners.errorMessage.value"
        :status-code="partners.statusCode.value"
        :show-sign-in="partners.unauthenticated.value"
        @retry="partners.refresh"
        @sign-in="relogin"
      />
      <AppEmpty
        v-else-if="partners.isEmpty.value"
        title="还没有 Partner"
        description="用户需要在用户端申请成为 Partner, 申请后在这里审核。"
      />
      <AppEmpty
        v-else-if="filtered.length === 0"
        title="当前状态没有 Partner"
        description="换一个状态过滤条件再看。"
      />
      <DataTable
        v-else
        :columns="COLUMNS"
      >
        <tr
          v-for="partner in paged.items.value"
          :key="partner.id"
          class="hover"
        >
          <td class="font-mono text-xs">{{ partner.referralCode ?? MISSING_TEXT }}</td>
          <td class="break-all font-mono text-xs text-base-content/70">{{ partner.userId }}</td>
          <td>
            <StatusBadge
              :label="presentPartnerStatus(partner.status).label"
              :tone="presentPartnerStatus(partner.status).tone"
            />
          </td>
          <td class="text-xs text-base-content/60">{{ formatDateTime(partner.createdAt) }}</td>
          <td class="text-xs">
            {{ globalRule ? formatBps(globalRule.rateBps) : MISSING_TEXT }}
          </td>
          <td>
            <div class="flex flex-wrap items-center justify-end gap-1">
              <AppButton
                size="sm"
                variant="outline"
                @click="openDetail(partner)"
              >
                详情
              </AppButton>
              <AppButton
                v-for="action in actionsFor(partner.status)"
                :key="action"
                size="sm"
                :variant="actionTone(action)"
                :disabled="busyId === partner.id"
                @click="askAction(partner, action)"
              >
                {{ ACTION_LABELS[action] }}
              </AppButton>
            </div>
          </td>
        </tr>
      </DataTable>
      <AppPagination
        v-if="
          !partners.pending.value &&
          !partners.errorMessage.value &&
          !partners.isEmpty.value &&
          filtered.length > 0
        "
        :page="paged.page.value"
        :total-pages="paged.totalPages.value"
        :total="paged.total.value"
        :page-size="paged.pageSize.value"
        @update:page="paged.setPage"
      />
    </div>

    <AppModal
      v-model="detailOpen"
      title="Partner 详情"
      description="字段来自 GET /admin/partners/:id, 佣金比例来自 GET /admin/commission-rules"
    >
      <AppLoading
        v-if="detail.pending.value && !detail.data.value"
        label="正在加载 Partner 详情"
      />
      <AppError
        v-else-if="detail.errorMessage.value"
        title="Partner 详情加载失败"
        :message="detail.errorMessage.value"
        :status-code="detail.statusCode.value"
        :show-sign-in="detail.unauthenticated.value"
        @retry="detail.load"
        @sign-in="relogin"
      />
      <div
        v-else-if="detail.data.value"
        class="flex flex-col gap-3"
      >
        <dl class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">Partner ID</dt>
            <dd class="break-all font-mono text-xs">{{ detailView.id }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">用户 ID</dt>
            <dd class="break-all font-mono text-xs">{{ detailView.userId }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">推荐码 (referral code)</dt>
            <dd class="font-mono text-xs">{{ detailView.referralCode ?? MISSING_TEXT }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">状态</dt>
            <dd>
              <StatusBadge
                :label="presentPartnerStatus(detailView.status).label"
                :tone="presentPartnerStatus(detailView.status).tone"
              />
            </dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">创建时间</dt>
            <dd class="text-sm">{{ formatDateTime(detailView.createdAt) }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">最近更新</dt>
            <dd class="text-sm">{{ formatDateTime(detailView.updatedAt) }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">全局默认佣金规则</dt>
            <dd class="text-sm tabular-nums">
              {{ globalRule ? formatBps(globalRule.rateBps) : MISSING_TEXT }}
            </dd>
          </div>
        </dl>
      </div>
      <template #footer>
        <AppButton
          v-for="action in actionsFor(detailView.status)"
          :key="action"
          size="sm"
          :variant="actionTone(action)"
          :disabled="busyId === selectedId"
          @click="askActionForDetail(action)"
        >
          {{ ACTION_LABELS[action] }}
        </AppButton>
        <AppButton
          size="sm"
          variant="ghost"
          @click="detailOpen = false"
        >
          关闭
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
