<template>
  <div class="mx-auto max-w-3xl p-6">
    <h1 class="mb-2 text-2xl font-bold dark:text-white">会员计划</h1>
    <p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
      开通会员解锁更多权益。当前为模拟支付环境, 点击「模拟支付」即可体验完整开通流程。
    </p>

    <!-- 未登录 -->
    <div
      v-if="needLogin"
      class="text-center"
    >
      <p class="mb-4 text-gray-500">登录后即可开通会员</p>
      <button
        class="btn border-none bg-purple-500 text-white shadow-md hover:bg-purple-600"
        @click="signIn()"
      >
        登录
      </button>
    </div>

    <div
      v-else-if="errorMessage"
      class="text-red-500"
    >
      {{ errorMessage }}
    </div>

    <template v-else>
      <!-- 当前状态 -->
      <div
        class="mb-6 rounded-2xl border p-4 text-center shadow-soft"
        :class="
          status?.isMember
            ? 'border-purple-300 bg-purple-50 dark:border-purple-600 dark:bg-purple-900/30'
            : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
        "
      >
        <template v-if="status?.isMember">
          <div class="font-semibold text-purple-600 dark:text-purple-300">✨ 会员生效中</div>
          <div class="mt-1 text-sm text-gray-500">
            {{ status.type }} · 至 {{ formatDate(status.endDate) }}
          </div>
        </template>
        <template v-else>
          <div class="text-gray-500">当前未开通会员</div>
        </template>
      </div>

      <p
        v-if="message"
        class="mb-4 text-center text-sm text-purple-600 dark:text-purple-400"
      >
        {{ message }}
      </p>

      <!-- 三档价格卡片 -->
      <div class="grid gap-4 md:grid-cols-3">
        <div
          v-for="plan in plans"
          :key="plan.id"
          class="flex flex-col rounded-2xl border p-5 text-center shadow-soft transition-all hover:-translate-y-1 hover:shadow-soft-lg"
          :class="
            plan.id === 'yearly'
              ? 'border-brand-300 bg-white dark:border-brand-500 dark:bg-gray-800'
              : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
          "
        >
          <div
            v-if="plan.id === 'yearly'"
            class="mb-2 inline-block self-center rounded-full bg-gradient-to-r from-brand-600 to-brand-400 px-3 py-0.5 text-xs font-medium text-white shadow-md shadow-blue-200/60"
          >
            最划算
          </div>
          <div class="text-lg font-semibold dark:text-white">{{ plan.name }}</div>
          <div class="my-2 text-3xl font-bold text-purple-600 dark:text-purple-400">
            ¥{{ (plan.priceFen / 100).toFixed(0) }}
          </div>
          <div class="text-sm text-gray-500">{{ durationLabel(plan.durationDays) }}</div>
          <button
            class="btn mt-4 border-none bg-purple-500 text-white shadow-md hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
            :disabled="paying !== ''"
            @click="mockPay(plan.id)"
          >
            {{ paying === plan.id ? "支付中…" : "模拟支付" }}
          </button>
        </div>
      </div>

      <p class="mt-6 text-xs text-gray-400">
        开发环境说明: 模拟支付会在下单后自动确认支付 (约 10 秒), 页面会轮询订单状态并展示结果。
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";

import type {
  CreateOrderResponse,
  MembershipPlanId,
  MembershipPlanInfo,
  OrderStatusResponse,
} from "~/api/membership";
import {
  confirmMockPay,
  createMembershipOrder,
  fetchMembershipStatus,
  fetchOrderStatus,
  fetchPlans,
} from "~/api/membership";
import { signIn } from "~/services/auth";

const plans = ref<MembershipPlanInfo[]>([]);
const loading = ref(true);
const needLogin = ref(false);
const errorMessage = ref("");
const message = ref("");
const status = ref<Awaited<ReturnType<typeof fetchMembershipStatus>> | null>(null);
const paying = ref("");

function formatDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("zh-CN");
}

function durationLabel(days: number | null) {
  return days == null ? "永久" : `${days} 天`;
}

async function loadStatus() {
  loading.value = true;
  errorMessage.value = "";
  needLogin.value = false;
  try {
    status.value = await fetchMembershipStatus();
  } catch (e: any) {
    if (e?.status === 401 || e?.statusCode === 401) {
      needLogin.value = true;
    } else {
      errorMessage.value = "加载会员状态失败, 请稍后再试";
    }
  } finally {
    loading.value = false;
  }

  async function loadPlans() {
    try {
      plans.value = await fetchPlans();
    } catch {
      // 加载失败时保持空, 避免展示过期硬编码价格
      plans.value = [];
    }
  }
}

/**
 * 模拟支付流程: 创建订单 -> 请求 mock-pay 确认 -> 轮询订单状态 (约 3 秒) -> 成功提示
 */
async function mockPay(planId: MembershipPlanId) {
  message.value = "";
  paying.value = planId;
  try {
    const order: CreateOrderResponse = await createMembershipOrder(planId);
    // 通知 mock 支付页确认支付 (仅 dev)
    try {
      await confirmMockPay(order.orderId);
    } catch {
      // mock-pay 失败不影响轮询 (provider 也会在 10 秒后自动置为 paid)
    }
    // 轮询订单状态, 最多 10 秒 (通常 mock 确认后 1-2 秒内 paid)
    const deadline = Date.now() + 10_000;
    let paid = false;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000));
      const res: OrderStatusResponse = await fetchOrderStatus(order.orderId);
      if (res.status === "paid") {
        paid = true;
        break;
      }
      if (res.status === "failed") break;
    }
    if (paid) {
      message.value = "🎉 开通成功! 会员已生效";
      status.value = await fetchMembershipStatus();
    } else {
      message.value = "支付确认中, 请稍后刷新查看";
    }
  } catch (e: any) {
    if (e?.status === 401 || e?.statusCode === 401) {
      needLogin.value = true;
    } else {
      message.value = "支付失败, 请稍后再试";
    }
  } finally {
    paying.value = "";
  }
}

onMounted(() => {
  loadStatus();
  loadPlans();
});
</script>
