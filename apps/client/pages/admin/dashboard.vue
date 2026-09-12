<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import type { DashboardOrderRow, DashboardOverview, DashboardPartnerStats } from "~/api/admin";
import { fetchDashboardOrders, fetchDashboardOverview, fetchDashboardPartners } from "~/api/admin";
import { signIn } from "~/services/auth";

const loading = ref(true);
const needLogin = ref(false);
const noPermission = ref(false);

const overview = ref<DashboardOverview | null>(null);
const partnerStats = ref<DashboardPartnerStats | null>(null);
const orders = ref<DashboardOrderRow[]>([]);
const ordersTotal = ref(0);
const page = ref(1);
const statusFilter = ref("");
const PAGE_SIZE = 20;

function yuan(fen: number) {
  return `¥${(fen / 100).toFixed(2)}`;
}

const revenueCards = computed(() => {
  const r = overview.value?.revenue;
  return [
    { label: "今日收入", value: yuan(r?.todayFen ?? 0) },
    { label: "本月收入", value: yuan(r?.monthFen ?? 0) },
    { label: "累计 GMV", value: yuan(r?.totalFen ?? 0) },
    { label: "退款", value: yuan(r?.refundFen ?? 0) },
    { label: "净收入", value: yuan(r?.netRevenueFen ?? 0) },
  ];
});

const memberCards = computed(() => {
  const m = overview.value?.memberships;
  return [
    { label: "有效会员", value: m?.activeCount ?? 0 },
    { label: "终身会员", value: m?.lifetimeCount ?? 0 },
    { label: "今日新增", value: m?.newToday ?? 0 },
    { label: "本月新增", value: m?.newMonth ?? 0 },
  ];
});

const orderCards = computed(() => {
  const o = overview.value?.orders;
  return [
    { label: "今日订单", value: o?.todayCount ?? 0 },
    { label: "本月订单", value: o?.monthCount ?? 0 },
    { label: "已支付", value: o?.paidCount ?? 0 },
    { label: "已退款", value: o?.refundedCount ?? 0 },
    { label: "待支付", value: o?.pendingCount ?? 0 },
  ];
});

const partnerCards = computed(() => {
  const p = partnerStats.value;
  const c = p?.commission;
  return [
    { label: "活跃推广者", value: p?.activePartners ?? 0 },
    { label: "累计推广", value: p?.referrals.total ?? 0 },
    { label: "付费转化", value: p?.conversion.paidUsers ?? 0 },
    { label: "转化率", value: `${p?.conversion.conversionRate ?? 0}%` },
    { label: "保护期佣金", value: yuan(c?.holdingFen ?? 0) },
    { label: "待确认佣金", value: yuan(c?.pendingFen ?? 0) },
    { label: "待结算佣金", value: yuan(c?.payableFen ?? 0) },
    { label: "已结算佣金", value: yuan(c?.paidFen ?? 0) },
    { label: "已撤销佣金", value: yuan(c?.reversedFen ?? 0) },
  ];
});

const totalPages = computed(() => Math.max(Math.ceil(ordersTotal.value / PAGE_SIZE), 1));

async function loadAll() {
  loading.value = true;
  needLogin.value = false;
  noPermission.value = false;
  try {
    const [ov, pt] = await Promise.all([fetchDashboardOverview(), fetchDashboardPartners()]);
    overview.value = ov;
    partnerStats.value = pt;
    await loadOrders();
  } catch (e: any) {
    const status = e?.status ?? e?.statusCode;
    if (status === 401) needLogin.value = true;
    else if (status === 403) noPermission.value = true;
  } finally {
    loading.value = false;
  }
}

async function loadOrders() {
  try {
    const data = await fetchDashboardOrders({
      page: page.value,
      limit: PAGE_SIZE,
      ...(statusFilter.value ? { status: statusFilter.value } : {}),
    });
    orders.value = data.items;
    ordersTotal.value = data.total;
  } catch (e: any) {
    const status = e?.status ?? e?.statusCode;
    if (status === 403) noPermission.value = true;
  }
}

async function applyFilter() {
  page.value = 1;
  await loadOrders();
}

async function goToPage(p: number) {
  if (p < 1 || p > totalPages.value) return;
  page.value = p;
  await loadOrders();
}

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleString("zh-CN") : "-";
}

onMounted(loadAll);
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-6">
    <h1 class="mb-6 text-2xl font-bold">商业数据看板</h1>

    <div
      v-if="loading"
      class="py-20 text-center"
    >
      <span class="loading loading-spinner loading-lg"></span>
    </div>
    <div
      v-else-if="needLogin"
      class="alert alert-warning justify-center"
    >
      请先登录
      <button
        class="btn btn-primary btn-sm"
        @click="signIn()"
      >
        登录
      </button>
    </div>
    <div
      v-else-if="noPermission"
      class="alert alert-error justify-center"
    >
      无管理员权限
    </div>

    <template v-else>
      <section class="mb-6">
        <h2 class="mb-2 text-lg font-semibold">收入</h2>
        <div class="grid grid-cols-2 gap-4 md:grid-cols-5">
          <div
            v-for="c in revenueCards"
            :key="c.label"
            class="stat rounded-lg bg-base-200 shadow"
          >
            <div class="stat-title text-xs">{{ c.label }}</div>
            <div class="stat-value text-xl">{{ c.value }}</div>
          </div>
        </div>
      </section>

      <section class="mb-6">
        <h2 class="mb-2 text-lg font-semibold">订单</h2>
        <div class="grid grid-cols-2 gap-4 md:grid-cols-5">
          <div
            v-for="c in orderCards"
            :key="c.label"
            class="stat rounded-lg bg-base-200 shadow"
          >
            <div class="stat-title text-xs">{{ c.label }}</div>
            <div class="stat-value text-xl">{{ c.value }}</div>
          </div>
        </div>
      </section>

      <section class="mb-6">
        <h2 class="mb-2 text-lg font-semibold">会员</h2>
        <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div
            v-for="c in memberCards"
            :key="c.label"
            class="stat rounded-lg bg-base-200 shadow"
          >
            <div class="stat-title text-xs">{{ c.label }}</div>
            <div class="stat-value text-xl">{{ c.value }}</div>
          </div>
        </div>
      </section>

      <section class="mb-6">
        <h2 class="mb-2 text-lg font-semibold">Partner</h2>
        <div class="grid grid-cols-2 gap-4 md:grid-cols-5">
          <div
            v-for="c in partnerCards"
            :key="c.label"
            class="stat rounded-lg bg-base-200 shadow"
          >
            <div class="stat-title text-xs">{{ c.label }}</div>
            <div class="stat-value text-xl">{{ c.value }}</div>
          </div>
        </div>
      </section>

      <section>
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-lg font-semibold">订单列表</h2>
          <div class="flex items-center gap-2">
            <select
              v-model="statusFilter"
              class="select select-bordered select-sm"
              @change="applyFilter"
            >
              <option value="">全部状态</option>
              <option value="pending">pending</option>
              <option value="processing">processing</option>
              <option value="paid">paid</option>
              <option value="failed">failed</option>
              <option value="cancelled">cancelled</option>
              <option value="refunded">refunded</option>
              <option value="expired">expired</option>
            </select>
          </div>
        </div>
        <div class="overflow-x-auto rounded-lg bg-base-200">
          <table class="table table-zebra">
            <thead>
              <tr>
                <th>订单</th>
                <th>用户</th>
                <th>方案</th>
                <th>金额</th>
                <th>状态</th>
                <th>Provider</th>
                <th>创建时间</th>
                <th>支付时间</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="o in orders"
                :key="o.orderId"
              >
                <td class="font-mono text-xs">{{ o.orderId }}</td>
                <td class="font-mono text-xs">{{ o.userId }}</td>
                <td>{{ o.planName ?? "-" }}</td>
                <td>{{ yuan(o.amountFen) }}</td>
                <td>
                  <span class="badge badge-sm">{{ o.status }}</span>
                </td>
                <td>{{ o.provider }}</td>
                <td>{{ fmtDate(o.createdAt) }}</td>
                <td>{{ fmtDate(o.paidAt) }}</td>
              </tr>
              <tr v-if="orders.length === 0">
                <td
                  colspan="8"
                  class="text-center text-base-content/60"
                >
                  暂无订单
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mt-4 flex items-center justify-center gap-2">
          <button
            class="btn btn-xs"
            :disabled="page <= 1"
            @click="goToPage(page - 1)"
          >
            上一页
          </button>
          <span class="text-sm">{{ page }} / {{ totalPages }}</span>
          <button
            class="btn btn-xs"
            :disabled="page >= totalPages"
            @click="goToPage(page + 1)"
          >
            下一页
          </button>
        </div>
      </section>
    </template>
  </div>
</template>
