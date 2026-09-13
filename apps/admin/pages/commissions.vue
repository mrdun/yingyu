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
import { useRelogin } from "~/composables/useRelogin";
import { useServerPagedList } from "~/composables/useServerPagedList";
import { getErrorMessage } from "~/services/admin-api";
import {
  confirmExpiredCommissions,
  fetchCommissionsPage,
  markCommissionPayable,
  settleCommission,
} from "~/services/commissions.service";
import type { AdminCommissionRow, CommissionStatusValue } from "~/types/admin";
import type { TableColumn } from "~/types/ui";
import { MISSING_TEXT, formatBps, formatDateTime, formatYuanFromFen } from "~/utils/format";
import { presentCommissionStatus } from "~/utils/status";

/**
 * 佣金管理。
 *
 * 接口:
 *  - GET  /admin/commissions            (本批次新增: 分页 page/pageSize + status 过滤, 只读)
 *  - POST /admin/commissions/confirm    到期的 holding → pending (幂等批处理)
 *  - POST /admin/commissions/:id/payable pending → payable
 *  - POST /admin/commissions/:id/settle  payable → paid (结算, 不含提现)
 *
 * 硬约束: 佣金金额 (commissionFen 与 orderAmountFen) 与比例 (rateBps) 一律直接展示接口快照,
 * 前端不做任何计算; 状态推进只走上面 3 个 POST, 并以接口返回值为准。
 */

const COLUMNS: TableColumn[] = [
  { key: "createdAt", label: "创建时间" },
  { key: "partner", label: "伙伴" },
  { key: "referred", label: "被推荐用户" },
  { key: "orderId", label: "关联订单" },
  { key: "orderAmountFen", label: "订单金额", align: "right" },
  { key: "commissionFen", label: "佣金", align: "right" },
  { key: "rateBps", label: "费率", align: "right" },
  { key: "status", label: "状态" },
  { key: "holdUntil", label: "保护期至" },
  { key: "actions", label: "操作", align: "right" },
];

/** 过滤项取值与 commission_records.status 的 CHECK 约束一致 */
const STATUS_OPTIONS: CommissionStatusValue[] = [
  "holding",
  "pending",
  "payable",
  "paid",
  "reversed",
];

const toast = useAdminToast();
const relogin = useRelogin();

const statusFilter = ref("");
const list = useServerPagedList<AdminCommissionRow>((params) =>
  fetchCommissionsPage({ ...params, status: statusFilter.value || undefined }),
);

const rows = computed(() => list.items.value);

const detailOpen = ref(false);
const selected = ref<AdminCommissionRow | null>(null);
const detailView = computed(() => {
  const row = selected.value;
  return {
    id: row?.id ?? MISSING_TEXT,
    partnerUserId: row?.partnerUserId ?? MISSING_TEXT,
    partnerUsername: row?.partnerUsername ?? null,
    referredUserId: row?.referredUserId ?? MISSING_TEXT,
    referredUsername: row?.referredUsername ?? null,
    orderId: row?.orderId ?? MISSING_TEXT,
    orderAmountFen: row?.orderAmountFen,
    commissionFen: row?.commissionFen,
    rateBps: row?.rateBps,
    status: row?.status ?? null,
    holdUntil: row?.holdUntil ?? null,
    createdAt: row?.createdAt ?? null,
    paidAt: row?.paidAt ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
});

const confirmOpen = ref(false);
const confirmLoading = ref(false);
const confirmTitle = ref("确认操作");
const confirmMessage = ref("");
const confirmLabel = ref("确认");
const confirmTone = ref<"danger" | "primary">("danger");
/** 确认后的动作; 返回字符串时作为 toast 的补充说明 (例如批处理条数) */
let pendingAction: (() => Promise<string | null>) | null = null;

function displayName(username: string | null, userId: string): string {
  return username ? `${username} (${userId})` : userId;
}

function openDetail(row: AdminCommissionRow): void {
  selected.value = row;
  detailOpen.value = true;
}

function askConfirm(options: {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  action: () => Promise<string | null>;
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
    const detail = await pendingAction();
    await list.load();
    toast.success("操作已完成", detail ?? "佣金状态以接口返回为准, 已重新拉取列表。");
  } catch (error) {
    toast.error("操作失败", getErrorMessage(error));
  } finally {
    confirmLoading.value = false;
    confirmOpen.value = false;
    pendingAction = null;
  }
}

function askConfirmExpired(): void {
  askConfirm({
    title: "确认到期佣金",
    message:
      "将把所有退款保护期已结束的佣金由「保护期」推进为「待确认」(幂等, 可重复执行)。" +
      "保护期内的佣金不会被改动。确认执行?",
    confirmLabel: "确认到期佣金",
    tone: "primary",
    action: async () => {
      const result = await confirmExpiredCommissions();
      return `接口返回本次推进了 ${result.confirmed} 条佣金 (confirmed)。`;
    },
  });
}

function askPayable(row: AdminCommissionRow): void {
  askConfirm({
    title: "标记为可结算",
    message:
      `将佣金 ${row.id} (${formatYuanFromFen(row.commissionFen)}) 从「待确认」推进为「可结算」。` +
      `只有满足结算条件的佣金才应推进, 请确认后执行。`,
    confirmLabel: "标记可结算",
    tone: "primary",
    action: async () => {
      await markCommissionPayable(row.id);
      return null;
    },
  });
}

function askSettle(row: AdminCommissionRow): void {
  askConfirm({
    title: "确认结算 (不可撤销)",
    message:
      `将佣金 ${row.id} (${formatYuanFromFen(row.commissionFen)}) 结算为「已结算」, ` +
      `后端会记录结算时间。该动作不可撤销, 请确认金额与伙伴 (${displayName(
        row.partnerUsername,
        row.partnerUserId,
      )}) 后再继续。`,
    confirmLabel: "确认结算",
    tone: "danger",
    action: async () => {
      await settleCommission(row.id);
      return null;
    },
  });
}

async function applyStatusFilter(): Promise<void> {
  await list.reload();
}

function resetFilter(): void {
  statusFilter.value = "";
  void list.reload();
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-xs text-base-content/60">
        数据来源: GET /admin/commissions (分页 + 状态过滤)。金额与比例均为接口快照,
        本页不做任何计算; 状态只能通过 confirm / payable / settle 三个接口推进。
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <select
          v-model="statusFilter"
          class="select select-bordered select-sm w-36"
          aria-label="按状态过滤"
          @change="applyStatusFilter"
        >
          <option value="">全部状态</option>
          <option
            v-for="status in STATUS_OPTIONS"
            :key="status"
            :value="status"
          >
            {{ presentCommissionStatus(status).label }}
          </option>
        </select>
        <AppButton
          size="sm"
          variant="ghost"
          :disabled="list.pending.value"
          @click="resetFilter"
        >
          重置
        </AppButton>
        <AppButton
          size="sm"
          variant="outline"
          :loading="list.pending.value"
          @click="list.load"
        >
          刷新
        </AppButton>
        <AppButton
          size="sm"
          @click="askConfirmExpired"
        >
          确认到期佣金
        </AppButton>
      </div>
    </div>

    <div class="overflow-hidden rounded-box border border-base-300 bg-base-100">
      <AppLoading
        v-if="list.pending.value && rows.length === 0"
        label="正在加载佣金流水"
      />
      <AppError
        v-else-if="list.errorMessage.value"
        title="佣金流水加载失败"
        :message="list.errorMessage.value"
        :status-code="list.statusCode.value"
        :show-sign-in="list.unauthenticated.value"
        @retry="list.load"
        @sign-in="relogin"
      />
      <AppEmpty
        v-else-if="list.isEmpty.value"
        title="没有符合条件的佣金记录"
        description="可以切换状态过滤条件; 佣金在订单支付成功并按规则生成后才会出现。"
      />
      <DataTable
        v-else
        :columns="COLUMNS"
      >
        <tr
          v-for="row in rows"
          :key="row.id"
          class="hover"
        >
          <td class="text-xs text-base-content/60">{{ formatDateTime(row.createdAt) }}</td>
          <td class="text-xs">{{ displayName(row.partnerUsername, row.partnerUserId) }}</td>
          <td class="text-xs">{{ displayName(row.referredUsername, row.referredUserId) }}</td>
          <td class="break-all font-mono text-xs text-base-content/70">{{ row.orderId }}</td>
          <td class="text-right text-sm tabular-nums">
            {{ formatYuanFromFen(row.orderAmountFen) }}
          </td>
          <td class="text-right text-sm tabular-nums">
            {{ formatYuanFromFen(row.commissionFen) }}
          </td>
          <td class="text-right text-sm tabular-nums">{{ formatBps(row.rateBps) }}</td>
          <td>
            <StatusBadge
              :label="presentCommissionStatus(row.status).label"
              :tone="presentCommissionStatus(row.status).tone"
            />
          </td>
          <td class="text-xs text-base-content/60">{{ formatDateTime(row.holdUntil) }}</td>
          <td>
            <div class="flex flex-wrap items-center justify-end gap-1">
              <AppButton
                size="sm"
                variant="outline"
                @click="openDetail(row)"
              >
                详情
              </AppButton>
              <AppButton
                v-if="row.status === 'pending'"
                size="sm"
                variant="primary"
                @click="askPayable(row)"
              >
                标记可结算
              </AppButton>
              <AppButton
                v-if="row.status === 'payable'"
                size="sm"
                variant="danger"
                @click="askSettle(row)"
              >
                结算
              </AppButton>
            </div>
          </td>
        </tr>
      </DataTable>
      <AppPagination
        v-if="!list.pending.value && !list.errorMessage.value && !list.isEmpty.value"
        :page="list.page.value"
        :total-pages="list.totalPages.value"
        :total="list.total.value"
        :page-size="list.pageSize.value"
        @update:page="list.setPage"
      />
    </div>

    <AppModal
      v-model="detailOpen"
      title="佣金详情"
      description="字段全部来自 GET /admin/commissions 的当前页数据 (该接口无单条详情路由)"
    >
      <dl class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-base-content/60">佣金 ID</dt>
          <dd class="break-all font-mono text-xs">{{ detailView.id }}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-base-content/60">关联订单</dt>
          <dd class="break-all font-mono text-xs">{{ detailView.orderId }}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-base-content/60">伙伴</dt>
          <dd class="text-sm">
            {{ displayName(detailView.partnerUsername, detailView.partnerUserId) }}
          </dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-base-content/60">被推荐用户</dt>
          <dd class="text-sm">
            {{ displayName(detailView.referredUsername, detailView.referredUserId) }}
          </dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-base-content/60">订单金额</dt>
          <dd class="text-sm tabular-nums">{{ formatYuanFromFen(detailView.orderAmountFen) }}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-base-content/60">佣金金额</dt>
          <dd class="text-sm tabular-nums">{{ formatYuanFromFen(detailView.commissionFen) }}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-base-content/60">费率 (快照)</dt>
          <dd class="text-sm tabular-nums">{{ formatBps(detailView.rateBps) }}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-base-content/60">状态</dt>
          <dd>
            <StatusBadge
              :label="presentCommissionStatus(detailView.status).label"
              :tone="presentCommissionStatus(detailView.status).tone"
            />
          </dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-base-content/60">保护期结束 (hold until)</dt>
          <dd class="text-sm">{{ formatDateTime(detailView.holdUntil) }}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-base-content/60">生成时间</dt>
          <dd class="text-sm">{{ formatDateTime(detailView.createdAt) }}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-base-content/60">结算时间</dt>
          <dd class="text-sm">{{ formatDateTime(detailView.paidAt) }}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-base-content/60">最近更新</dt>
          <dd class="text-sm">{{ formatDateTime(detailView.updatedAt) }}</dd>
        </div>
      </dl>
      <p class="mt-3 text-xs text-base-content/50">
        说明: 佣金比例与金额使用订单支付时的快照, 之后修改佣金规则不影响历史记录。
      </p>
      <template #footer>
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
