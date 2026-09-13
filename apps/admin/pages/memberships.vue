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
import AppPagination from "~/components/ui/AppPagination.vue";
import { useAdminToast } from "~/composables/useAdminToast";
import { useAsyncResource } from "~/composables/useAsyncResource";
import { usePagedList } from "~/composables/usePagedList";
import { useRelogin } from "~/composables/useRelogin";
import { getErrorMessage } from "~/services/admin-api";
import { fetchMembershipGrowth, grantMembership } from "~/services/memberships.service";
import { fetchPlans } from "~/services/plans.service";
import type { AdminMembershipGrowthPoint } from "~/types/admin";
import type { TableColumn } from "~/types/ui";
import { MISSING_TEXT, formatCount } from "~/utils/format";

/**
 * 会员管理。
 *
 * 接口:
 *  - GET  /admin/dashboard/memberships 会员增长 (按天聚合: 新增会员 / 永久会员 / 付费用户)
 *  - POST /admin/memberships/grant     管理员「授予会员」(body {userId, planId})
 *  - GET  /admin/plans                 授予时选择方案 (方案与价格唯一来源, 前端不硬编码)
 *
 * 文案约束: 管理员赠送会员不产生订单与支付流水, 因此统一称「授予会员」。
 * 后端缺口 (只报告): 没有会员列表接口, 无法列出单个会员 (用户/方案/到期时间),
 * 本页只展示日粒度聚合, 并明确说明明细暂不可得。
 */

const COLUMNS: TableColumn[] = [
  { key: "date", label: "日期" },
  { key: "newMembers", label: "新增会员", align: "right" },
  { key: "lifetimePurchases", label: "永久会员", align: "right" },
  { key: "paidUsers", label: "付费用户", align: "right" },
];

const toast = useAdminToast();
const relogin = useRelogin();

const growth = useAsyncResource(fetchMembershipGrowth, {
  isEmpty: (data) => !Array.isArray(data.daily) || data.daily.length === 0,
});
const plans = useAsyncResource(fetchPlans, { isEmpty: () => false });

const daily = computed<AdminMembershipGrowthPoint[]>(() => growth.data.value?.daily ?? []);
const paged = usePagedList(daily, { pageSize: 10 });

const grantUserId = ref("");
const grantPlanId = ref("");
const grantError = ref<string | null>(null);

const confirmOpen = ref(false);
const confirmLoading = ref(false);
const confirmMessage = ref("");
let pendingAction: (() => Promise<void>) | null = null;

const planOptions = computed(() => plans.data.value ?? []);

function planName(planId: string): string {
  return planOptions.value.find((plan) => plan.id === planId)?.name ?? planId;
}

function askGrant(): void {
  const userId = grantUserId.value.trim();
  const planId = grantPlanId.value;
  grantError.value = null;

  if (!userId) {
    grantError.value = "请填写用户 ID (Logto 用户 id)";
    return;
  }
  if (!planId) {
    grantError.value = "请选择要授予的会员方案";
    return;
  }

  confirmMessage.value =
    `将为用户 ${userId} 授予「${planName(planId)}」会员。` +
    `该操作不产生订单与支付流水, 但会直接写入会员权益 (已有未到期会员将顺延)。确认授予?`;
  pendingAction = async () => {
    await grantMembership({ userId, planId });
  };
  confirmOpen.value = true;
}

async function runPendingAction(): Promise<void> {
  if (!pendingAction || confirmLoading.value) return;
  confirmLoading.value = true;
  try {
    await pendingAction();
    await growth.refresh();
    toast.success("会员已授予", "会员权益以接口返回为准, 已重新拉取会员增长数据。");
    grantUserId.value = "";
  } catch (error) {
    toast.error("授予会员失败", getErrorMessage(error));
  } finally {
    confirmLoading.value = false;
    confirmOpen.value = false;
    pendingAction = null;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-base-content/60">
        数据来源: GET /admin/dashboard/memberships (按天聚合)。 后端暂无会员列表接口,
        因此这里展示的是增长明细, 不展示单个会员记录。
      </p>
      <AppButton
        size="sm"
        variant="outline"
        :loading="growth.pending.value"
        @click="growth.refresh"
      >
        刷新
      </AppButton>
    </div>

    <section class="rounded-box border border-base-300 bg-base-100 px-4 py-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-semibold">授予会员</h2>
          <StatusBadge
            label="不产生订单/支付"
            tone="info"
          />
        </div>
        <span class="text-xs text-base-content/50">
          用于客服补偿/内部赠送; 方案与价格来自 GET /admin/plans
        </span>
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <div class="w-64">
          <AppInput
            v-model="grantUserId"
            label="用户 ID"
            placeholder="Logto 用户 id"
            :error="grantError"
            @keyup.enter="askGrant"
          />
        </div>
        <label class="form-control w-64">
          <span class="label pb-1 text-xs font-medium text-base-content/70">会员方案</span>
          <select
            v-model="grantPlanId"
            class="select select-bordered select-sm w-full"
            aria-label="选择会员方案"
          >
            <option value="">请选择方案</option>
            <option
              v-for="plan in planOptions"
              :key="plan.id"
              :value="plan.id"
            >
              {{ plan.name }}
            </option>
          </select>
        </label>
        <AppButton
          size="sm"
          @click="askGrant"
        >
          授予会员
        </AppButton>
      </div>

      <p class="mt-2 text-xs text-base-content/50">
        方案列表加载失败或为空时无法授予 —— 方案 id 不允许手填, 避免授予到不存在的方案。
      </p>
      <p
        v-if="plans.errorMessage.value"
        class="mt-1 text-xs text-error"
      >
        方案加载失败: {{ plans.errorMessage.value }}
      </p>
    </section>

    <div class="overflow-hidden rounded-box border border-base-300 bg-base-100">
      <AppLoading
        v-if="growth.pending.value && !growth.data.value"
        label="正在加载会员增长数据"
      />
      <AppError
        v-else-if="growth.errorMessage.value"
        title="会员数据加载失败"
        :message="growth.errorMessage.value"
        :status-code="growth.statusCode.value"
        :show-sign-in="growth.unauthenticated.value"
        @retry="growth.refresh"
        @sign-in="relogin"
      />
      <AppEmpty
        v-else-if="growth.isEmpty.value"
        title="暂无会员增长数据"
        description="后端在该时间窗口内没有返回任何会员记录。"
      />
      <DataTable
        v-else
        :columns="COLUMNS"
      >
        <tr
          v-for="point in paged.items.value"
          :key="point.date"
          class="hover"
        >
          <td class="text-sm">{{ point.date }}</td>
          <td class="text-right text-sm tabular-nums">{{ formatCount(point.newMembers) }}</td>
          <td class="text-right text-sm tabular-nums">
            {{ formatCount(point.lifetimePurchases) }}
          </td>
          <td class="text-right text-sm tabular-nums">{{ formatCount(point.paidUsers) }}</td>
        </tr>
      </DataTable>
      <AppPagination
        v-if="!growth.pending.value && !growth.errorMessage.value && !growth.isEmpty.value"
        :page="paged.page.value"
        :total-pages="paged.totalPages.value"
        :total="paged.total.value"
        :page-size="paged.pageSize.value"
        @update:page="paged.setPage"
      />
    </div>

    <section class="rounded-box border border-dashed border-base-300 bg-base-100 px-4 py-3">
      <h2 class="text-sm font-semibold">本页取不到的会员字段</h2>
      <ul class="mt-2 flex flex-col gap-1 text-xs text-base-content/60">
        <li>会员列表 (单个会员的用户/方案/到期时间): 后端暂无对应接口, 统一显示「暂无数据」。</li>
        <li>会员到期时间与周期: 接口未返回, 明细位置显示「{{ MISSING_TEXT }}」。</li>
        <li>会员状态分布 (生效/取消): 接口只返回按天聚合, 不返回分布。</li>
      </ul>
    </section>

    <AppConfirmDialog
      v-model="confirmOpen"
      title="确认授予会员"
      :message="confirmMessage"
      confirm-label="授予会员"
      tone="primary"
      :loading="confirmLoading"
      @confirm="runPendingAction"
    />
  </div>
</template>
