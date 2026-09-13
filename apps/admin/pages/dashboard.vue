<script setup lang="ts">
import { computed } from "vue";

import StatusBadge from "~/components/status/StatusBadge.vue";
import AppButton from "~/components/ui/AppButton.vue";
import AppError from "~/components/ui/AppError.vue";
import AppLoading from "~/components/ui/AppLoading.vue";
import StatCard from "~/components/ui/StatCard.vue";
import { useAsyncResource } from "~/composables/useAsyncResource";
import { useRelogin } from "~/composables/useRelogin";
import { fetchAdminOverview, fetchDashboardOverview } from "~/services/dashboard.service";
import { MISSING_TEXT, formatCount, formatYuanFromFen } from "~/utils/format";

/**
 * Dashboard: 只用两个真实接口的数据。
 *  - GET /admin/overview            学习侧 (用户/活跃/课程包/句子/复习)
 *  - GET /admin/dashboard/overview  商业化侧 (收入/订单/会员/Partner)
 * 后端没有的指标一律显示 "—" 并注明来源缺失, 不编造数字 (见页面底部「尚未接入的指标」)。
 */
const learning = useAsyncResource(fetchAdminOverview);
const business = useAsyncResource(fetchDashboardOverview);
const relogin = useRelogin();

const isLoadingAll = computed(() => learning.pending.value && business.pending.value);
const isFailedAll = computed(
  () => Boolean(learning.errorMessage.value) && Boolean(business.errorMessage.value),
);

const overview = computed(() => learning.data.value);
const revenue = computed(() => business.data.value?.revenue ?? null);
const orders = computed(() => business.data.value?.orders ?? null);
const memberships = computed(() => business.data.value?.memberships ?? null);
const partners = computed(() => business.data.value?.partners ?? null);

/**
 * 本批次取不到的指标 (后端没有对应接口) —— 明确列出, 不伪造。
 */
const UNAVAILABLE_METRICS = [
  { label: "待审核 Partner", note: "后端暂无对应接口" },
  { label: "待审核课程", note: "后端暂无对应接口" },
  {
    label: "支付渠道状态",
    note: "数据源为 GET /admin/payment-channels, 本页未接入 (见「支付渠道」页)",
  },
];

function refreshAll(): void {
  void learning.refresh();
  void business.refresh();
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-base-content/60">
        数据来源: GET /admin/overview + GET /admin/dashboard/overview (金额单位为「分」,
        已换算为元展示)
      </p>
      <AppButton
        size="sm"
        variant="outline"
        :loading="learning.pending.value || business.pending.value"
        @click="refreshAll"
      >
        刷新
      </AppButton>
    </div>

    <AppLoading
      v-if="isLoadingAll"
      label="正在加载概览数据"
    />

    <AppError
      v-else-if="isFailedAll"
      title="概览数据加载失败"
      :message="business.errorMessage.value ?? learning.errorMessage.value"
      :status-code="business.statusCode.value ?? learning.statusCode.value"
      :show-sign-in="business.unauthenticated.value || learning.unauthenticated.value"
      @retry="refreshAll"
      @sign-in="relogin"
    />

    <template v-else>
      <section class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-semibold">学习概览</h2>
          <AppLoading
            v-if="learning.pending.value"
            label=""
          />
        </div>
        <AppError
          v-if="learning.errorMessage.value"
          title="学习概览加载失败"
          :message="learning.errorMessage.value"
          :status-code="learning.statusCode.value"
          :show-sign-in="learning.unauthenticated.value"
          @retry="learning.refresh"
          @sign-in="relogin"
        />
        <div
          v-else
          class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
        >
          <StatCard
            label="用户总数"
            :value="formatCount(overview?.userCount)"
          />
          <StatCard
            label="今日活跃"
            :value="formatCount(overview?.activeToday)"
          />
          <StatCard
            label="课程包"
            :value="formatCount(overview?.coursePackCount)"
          />
          <StatCard
            label="句子总数"
            :value="formatCount(overview?.statementCount)"
          />
          <StatCard
            label="复习记录"
            :value="formatCount(overview?.totalReviewRecords)"
          />
          <StatCard
            label="今日学习句子"
            :value="formatCount(overview?.todayLearnStatements)"
          />
        </div>
      </section>

      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-semibold">收入</h2>
        <AppError
          v-if="business.errorMessage.value"
          title="收入数据加载失败"
          :message="business.errorMessage.value"
          :status-code="business.statusCode.value"
          :show-sign-in="business.unauthenticated.value"
          @retry="business.refresh"
          @sign-in="relogin"
        />
        <div
          v-else
          class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
        >
          <StatCard
            label="今日收入"
            :value="formatYuanFromFen(revenue?.todayFen)"
          />
          <StatCard
            label="昨日收入"
            :value="formatYuanFromFen(revenue?.yesterdayFen)"
          />
          <StatCard
            label="本月收入"
            :value="formatYuanFromFen(revenue?.monthFen)"
          />
          <StatCard
            label="累计收入"
            :value="formatYuanFromFen(revenue?.totalFen)"
          />
          <StatCard
            label="累计退款"
            :value="formatYuanFromFen(revenue?.refundFen)"
          />
          <StatCard
            label="净收入"
            :value="formatYuanFromFen(revenue?.netRevenueFen)"
          />
        </div>
      </section>

      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-semibold">订单 / 会员</h2>
        <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard
            label="今日订单"
            :value="formatCount(orders?.todayCount)"
          />
          <StatCard
            label="本月订单"
            :value="formatCount(orders?.monthCount)"
          />
          <StatCard
            label="累计已支付"
            :value="formatCount(orders?.paidCount)"
          />
          <StatCard
            label="待支付订单"
            :value="formatCount(orders?.pendingCount)"
          />
          <StatCard
            label="已退款订单"
            :value="formatCount(orders?.refundedCount)"
          />
          <StatCard
            label="生效会员"
            :value="formatCount(memberships?.activeCount)"
          />
          <StatCard
            label="长期会员"
            :value="formatCount(memberships?.lifetimeCount)"
          />
          <StatCard
            label="今日新增会员"
            :value="formatCount(memberships?.newToday)"
          />
          <StatCard
            label="本月新增会员"
            :value="formatCount(memberships?.newMonth)"
          />
        </div>
      </section>

      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-semibold">Partner 与佣金</h2>
        <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard
            label="活跃 Partner"
            :value="formatCount(partners?.activePartners)"
          />
          <StatCard
            label="今日推荐"
            :value="formatCount(partners?.referralsToday)"
          />
          <StatCard
            label="本月推荐"
            :value="formatCount(partners?.referralsMonth)"
          />
          <StatCard
            label="待结算佣金"
            :value="formatYuanFromFen(partners?.commissionPendingFen)"
          />
          <StatCard
            label="累计佣金 (未冲正)"
            :value="formatYuanFromFen(partners?.commissionTotalFen)"
          />
        </div>
      </section>

      <section class="rounded-box border border-dashed border-base-300 bg-base-100 px-4 py-4">
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-semibold">尚未接入的指标</h2>
          <StatusBadge
            label="来源缺失"
            tone="neutral"
          />
        </div>
        <p class="mt-1 text-xs text-base-content/60">
          以下指标本批次没有可用的后端数据源, 统一显示 {{ MISSING_TEXT }}, 不做推测或填充。
        </p>
        <ul class="mt-3 flex flex-col gap-2">
          <li
            v-for="metric in UNAVAILABLE_METRICS"
            :key="metric.label"
            class="flex flex-wrap items-center justify-between gap-2 border-b border-base-200 pb-2 last:border-b-0"
          >
            <span class="text-xs text-base-content/80">{{ metric.label }}</span>
            <span class="flex items-center gap-2">
              <span class="text-sm font-medium tabular-nums text-base-content/50">
                {{ MISSING_TEXT }}
              </span>
              <span class="text-xs text-base-content/50">{{ metric.note }}</span>
            </span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
