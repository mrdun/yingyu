<script setup lang="ts">
import { computed, ref } from "vue";

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
import { useRelogin } from "~/composables/useRelogin";
import { useServerPagedList } from "~/composables/useServerPagedList";
import { getErrorMessage } from "~/services/admin-api";
import {
  fetchOrder,
  fetchOrdersPage,
  reconcileOrder,
  refundOrder,
} from "~/services/orders.service";
import type { AdminOrderDetail, AdminOrderRow, OrderStatusValue } from "~/types/admin";
import type { TableColumn } from "~/types/ui";
import { MISSING_TEXT, formatDateTime, formatYuanFromFen } from "~/utils/format";
import { presentOrderStatus } from "~/utils/status";

/**
 * 订单管理。
 *
 * 接口:
 *  - 列表 GET /admin/dashboard/orders (后端唯一带 total 的订单列表接口, 支持 status/provider/userId 过滤)
 *  - 详情 GET /admin/orders/:id
 *  - 对账 POST /admin/orders/:orderId/reconcile (异常订单: 回调丢失/退款中断)
 *  - 退款 POST /admin/orders/:orderId/refund (危险操作, 二次确认)
 *
 * 硬约束: 前端不改变订单状态 —— 页面只渲染接口返回的 status, 动作成功后重新拉取列表与详情。
 * 列表接口不返回币种, 因此表格里显示「—」, 币种在详情面板 (GET /admin/orders/:id) 展示。
 */

const COLUMNS: TableColumn[] = [
  { key: "orderId", label: "订单号" },
  { key: "userId", label: "用户 ID" },
  { key: "plan", label: "会员方案" },
  { key: "amount", label: "金额", align: "right" },
  { key: "status", label: "状态" },
  { key: "provider", label: "渠道" },
  { key: "createdAt", label: "创建时间" },
  { key: "actions", label: "操作", align: "right" },
];

/** 状态过滤项: 取值来自后端状态机 (order-status.ts), 文案与列表用同一处映射 */
const STATUS_OPTIONS: OrderStatusValue[] = [
  "pending",
  "processing",
  "paid",
  "refunding",
  "refunded",
  "failed",
  "cancelled",
  "expired",
];

const toast = useAdminToast();
const relogin = useRelogin();

const statusFilter = ref("");
const providerFilter = ref("");
const userFilter = ref("");

const list = useServerPagedList<AdminOrderRow>((params) =>
  fetchOrdersPage({
    ...params,
    status: statusFilter.value || undefined,
    provider: providerFilter.value.trim() || undefined,
    userId: userFilter.value.trim() || undefined,
  }),
);

const detailOpen = ref(false);
const selectedRow = ref<AdminOrderRow | null>(null);
const detail = useAsyncResource<AdminOrderDetail>(
  () => {
    const id = selectedRow.value?.orderId;
    if (!id) throw new Error("未选择订单");
    return fetchOrder(id);
  },
  { immediate: false, isEmpty: (data) => !data },
);

const confirmOpen = ref(false);
const confirmLoading = ref(false);
const confirmTitle = ref("确认操作");
const confirmMessage = ref("");
const confirmLabel = ref("确认");
const confirmTone = ref<"danger" | "primary">("danger");
let pendingAction: (() => Promise<void>) | null = null;

const rows = computed(() => list.items.value);

/** 只有接口返回 paid/refunding 时才允许发起退款 (其它状态后端一定会拒绝) */
function canRefund(status: string | null | undefined): boolean {
  return status === "paid" || status === "refunding";
}

const selectedOrderId = computed(() => selectedRow.value?.orderId ?? "");
const selectedPlanName = computed(() => selectedRow.value?.planName ?? MISSING_TEXT);
const canRefundSelected = computed(() => canRefund(selectedRow.value?.status));

/**
 * 详情视图: 用空值兜底, 模板里不做可选链 —— 详情字段全部来自接口返回值,
 * 加载失败时走 AppError 分支, 这里只是让类型保持非空。
 */
const detailView = computed(() => {
  const row = detail.data.value;
  return {
    id: row?.id ?? MISSING_TEXT,
    userId: row?.userId ?? MISSING_TEXT,
    planId: row?.planId ?? MISSING_TEXT,
    amountFen: row?.amountFen,
    currency: row?.currency ?? MISSING_TEXT,
    status: row?.status ?? null,
    provider: row?.provider ?? MISSING_TEXT,
    paymentMethod: row?.paymentMethod ?? null,
    createdAt: row?.createdAt ?? null,
    paidAt: row?.paidAt ?? null,
    refundedAt: row?.refundedAt ?? null,
  };
});

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
    toast.success("操作已完成", "订单状态以接口返回为准, 已重新拉取列表。");
  } catch (error) {
    toast.error("操作失败", getErrorMessage(error));
  } finally {
    confirmLoading.value = false;
    confirmOpen.value = false;
    pendingAction = null;
  }
}

async function refreshAll(): Promise<void> {
  await list.load();
  if (detailOpen.value && selectedOrderId.value) {
    await detail.load();
  }
}

function applyFilters(): void {
  void list.reload();
}

function resetFilters(): void {
  statusFilter.value = "";
  providerFilter.value = "";
  userFilter.value = "";
  void list.reload();
}

async function openDetail(row: AdminOrderRow): Promise<void> {
  selectedRow.value = row;
  detailOpen.value = true;
  await detail.load();
}

/** 不传 row 时作用于当前详情里的订单 (弹窗底部按钮) */
function askReconcile(row?: AdminOrderRow): void {
  const target = row ?? selectedRow.value;
  if (!target) return;
  askConfirm({
    title: "异常订单对账",
    message:
      `将对订单 ${target.orderId} 主动向支付渠道查单/关单: ` +
      `pending 超时会先关第三方单再置为过期; pending 未超时会查询是否已支付并补入账; ` +
      `refunding 停留会恢复中断的退款。该动作可能推进订单状态, 请确认后执行。`,
    confirmLabel: "执行对账",
    tone: "primary",
    action: async () => {
      await reconcileOrder(target.orderId);
    },
  });
}

function askRefund(row?: AdminOrderRow): void {
  const target = row ?? selectedRow.value;
  if (!target) return;
  askConfirm({
    title: "确认退款 (不可撤销)",
    message:
      `订单 ${target.orderId} (${formatYuanFromFen(target.amountFen)}) 将执行管理员退款, ` +
      `后果: 1) 原路退回用户款项; 2) 撤销该订单产生的会员权益; 3) 冲正该订单已生成的佣金。` +
      `退款不可撤销, 请与用户确认后再继续。`,
    confirmLabel: "确认退款",
    tone: "danger",
    action: async () => {
      await refundOrder(target.orderId);
    },
  });
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-xs text-base-content/60">
        数据来源: 列表 GET /admin/dashboard/orders, 详情 GET /admin/orders/:id。 订单状态只读展示,
        不提供任何"直接改状态"的入口。
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <select
          v-model="statusFilter"
          class="select select-bordered select-sm w-36"
          aria-label="按状态过滤"
          @change="applyFilters"
        >
          <option value="">全部状态</option>
          <option
            v-for="status in STATUS_OPTIONS"
            :key="status"
            :value="status"
          >
            {{ presentOrderStatus(status).label }}
          </option>
        </select>
        <div class="w-40">
          <AppInput
            v-model="providerFilter"
            placeholder="渠道 mock/wechat/alipay"
            @keyup.enter="applyFilters"
          />
        </div>
        <div class="w-44">
          <AppInput
            v-model="userFilter"
            placeholder="用户 ID"
            @keyup.enter="applyFilters"
          />
        </div>
        <AppButton
          size="sm"
          variant="outline"
          :loading="list.pending.value"
          @click="applyFilters"
        >
          查询
        </AppButton>
        <AppButton
          size="sm"
          variant="ghost"
          :disabled="list.pending.value"
          @click="resetFilters"
        >
          重置
        </AppButton>
      </div>
    </div>

    <div class="overflow-hidden rounded-box border border-base-300 bg-base-100">
      <AppLoading
        v-if="list.pending.value && rows.length === 0"
        label="正在加载订单列表"
      />
      <AppError
        v-else-if="list.errorMessage.value"
        title="订单列表加载失败"
        :message="list.errorMessage.value"
        :status-code="list.statusCode.value"
        :show-sign-in="list.unauthenticated.value"
        @retry="list.load"
        @sign-in="relogin"
      />
      <AppEmpty
        v-else-if="list.isEmpty.value"
        title="没有符合条件的订单"
        description="可以调整状态 / 渠道 / 用户过滤条件后重试。"
      />
      <DataTable
        v-else
        :columns="COLUMNS"
      >
        <tr
          v-for="order in rows"
          :key="order.orderId"
          class="hover"
        >
          <td class="break-all font-mono text-xs">{{ order.orderId }}</td>
          <td class="break-all font-mono text-xs text-base-content/70">{{ order.userId }}</td>
          <td class="text-sm">{{ order.planName ?? MISSING_TEXT }}</td>
          <td class="text-right text-sm tabular-nums">
            {{ formatYuanFromFen(order.amountFen) }}
          </td>
          <td>
            <StatusBadge
              :label="presentOrderStatus(order.status).label"
              :tone="presentOrderStatus(order.status).tone"
            />
          </td>
          <td class="text-xs">{{ order.provider }}</td>
          <td class="text-xs text-base-content/60">{{ formatDateTime(order.createdAt) }}</td>
          <td>
            <div class="flex items-center justify-end gap-1">
              <AppButton
                size="sm"
                variant="outline"
                @click="openDetail(order)"
              >
                详情
              </AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                @click="askReconcile(order)"
              >
                对账
              </AppButton>
              <AppButton
                size="sm"
                variant="danger"
                :disabled="!canRefund(order.status)"
                @click="askRefund(order)"
              >
                退款
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
      title="订单详情"
      description="字段全部来自 GET /admin/orders/:id, 前端不做任何状态推断"
    >
      <AppLoading
        v-if="detail.pending.value && !detail.data.value"
        label="正在加载订单详情"
      />
      <AppError
        v-else-if="detail.errorMessage.value"
        title="订单详情加载失败"
        :message="detail.errorMessage.value"
        :status-code="detail.statusCode.value"
        :show-sign-in="detail.unauthenticated.value"
        @retry="detail.load"
        @sign-in="relogin"
      />
      <div
        v-else-if="detail.data.value"
        class="flex flex-col gap-4"
      >
        <dl class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">订单号</dt>
            <dd class="break-all font-mono text-xs">{{ detailView.id }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">用户 ID</dt>
            <dd class="break-all font-mono text-xs">{{ detailView.userId }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">会员方案</dt>
            <dd class="text-sm">
              {{ selectedPlanName }}
              <span class="text-xs text-base-content/50">({{ detailView.planId }})</span>
            </dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">金额</dt>
            <dd class="text-sm tabular-nums">
              {{ formatYuanFromFen(detailView.amountFen) }}
              <span class="text-xs text-base-content/50">{{ detailView.currency }}</span>
            </dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">状态</dt>
            <dd>
              <StatusBadge
                :label="presentOrderStatus(detailView.status).label"
                :tone="presentOrderStatus(detailView.status).tone"
              />
            </dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">支付渠道</dt>
            <dd class="text-sm">
              {{ detailView.provider }}
              <span class="text-xs text-base-content/50">
                {{ detailView.paymentMethod ?? MISSING_TEXT }}
              </span>
            </dd>
          </div>
        </dl>

        <div>
          <h3 class="mb-2 text-xs font-semibold text-base-content/70">时间线</h3>
          <ul class="flex flex-col gap-2">
            <li class="flex items-center justify-between border-b border-base-200 pb-2 text-xs">
              <span class="text-base-content/60">创建</span>
              <span>{{ formatDateTime(detailView.createdAt) }}</span>
            </li>
            <li class="flex items-center justify-between border-b border-base-200 pb-2 text-xs">
              <span class="text-base-content/60">支付</span>
              <span>{{ formatDateTime(detailView.paidAt) }}</span>
            </li>
            <li class="flex items-center justify-between text-xs">
              <span class="text-base-content/60">退款</span>
              <span>{{ formatDateTime(detailView.refundedAt) }}</span>
            </li>
          </ul>
        </div>
      </div>
      <template #footer>
        <AppButton
          size="sm"
          variant="ghost"
          :disabled="!selectedOrderId"
          @click="askReconcile()"
        >
          异常订单对账
        </AppButton>
        <AppButton
          size="sm"
          variant="danger"
          :disabled="!canRefundSelected"
          @click="askRefund()"
        >
          退款
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
