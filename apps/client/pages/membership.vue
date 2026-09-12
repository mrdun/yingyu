<template>
  <div class="mx-auto max-w-3xl p-6">
    <h1 class="mb-2 text-2xl font-bold dark:text-white">会员计划</h1>
    <p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
      选择会员方案与支付方式, 扫码支付成功后会员自动开通 (支付结果以服务端确认为准)。
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

      <!-- 支付方式 (由服务端渠道开关决定) -->
      <div
        v-if="paymentMethods.length > 0"
        class="mb-6"
      >
        <div class="mb-2 text-sm font-medium text-gray-600 dark:text-gray-300">支付方式</div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="method in paymentMethods"
            :key="method.method"
            class="btn btn-sm"
            :class="
              selectedMethod === method.method
                ? 'border-none bg-purple-500 text-white hover:bg-purple-600'
                : 'btn-outline'
            "
            :disabled="!!paying"
            @click="selectedMethod = method.method"
          >
            {{ method.label }}
          </button>
        </div>
      </div>

      <!-- 支付中: 二维码 / 支付链接 -->
      <div
        v-if="activeOrder"
        class="mb-6 rounded-2xl border border-purple-200 bg-white p-5 text-center shadow-soft dark:border-purple-700 dark:bg-gray-800"
      >
        <div class="font-semibold text-purple-600 dark:text-purple-300">
          {{ methodLabel(activeOrder.method) }}
        </div>
        <p class="mt-1 text-xs text-gray-500">
          待支付金额 ¥{{ (activeOrder.amountFen / 100).toFixed(2) }}
          <span v-if="remainingText"> · {{ remainingText }}</span>
        </p>

        <div
          v-if="activeOrder.payCode"
          class="mt-4"
        >
          <p class="mb-2 text-sm text-gray-600 dark:text-gray-300">
            {{ activeOrder.qr ? "请使用手机扫码完成支付" : "请在支付渠道中完成支付" }}
          </p>
          <div
            class="mx-auto max-w-md break-all rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300"
          >
            {{ activeOrder.payCode }}
          </div>
          <button
            class="btn btn-outline btn-xs mt-3"
            @click="copyPayCode"
          >
            {{ copied ? "已复制" : "复制支付链接" }}
          </button>
        </div>

        <div
          v-if="activeOrder.payUrl"
          class="mt-4"
        >
          <a
            :href="activeOrder.payUrl"
            class="btn border-none bg-purple-500 text-white hover:bg-purple-600"
          >
            前往支付页面
          </a>
        </div>

        <p class="mt-4 text-xs text-gray-400">
          支付完成后会自动确认 (无需手动刷新), 请勿关闭本页面。
        </p>
        <button
          class="btn btn-ghost btn-xs mt-2"
          @click="cancelActiveOrder"
        >
          取消 / 重新选择
        </button>
      </div>

      <!-- 价格卡片 -->
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
          <div class="text-lg font-semibold dark:text-white">{{ plan.name }}</div>
          <div class="my-2 text-3xl font-bold text-purple-600 dark:text-purple-400">
            ¥{{ (plan.priceFen / 100).toFixed(0) }}
          </div>
          <div class="text-sm text-gray-500">{{ durationLabel(plan.durationDays) }}</div>
          <button
            class="btn mt-4 border-none bg-purple-500 text-white shadow-md hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
            :disabled="paying !== '' || !!activeOrder"
            @click="pay(plan.id)"
          >
            {{ paying === plan.id ? "处理中…" : payButtonLabel }}
          </button>
        </div>
      </div>

      <p
        v-if="plans.length === 0"
        class="mt-6 text-center text-sm text-gray-400"
      >
        暂无可购买的会员方案, 请稍后再试。
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import type {
  MembershipPlanId,
  MembershipPlanInfo,
  OrderStatusResponse,
  PaymentMethod,
  PaymentMethodInfo,
  PaymentPayload,
} from "~/api/membership";
import {
  confirmMockPay,
  createMembershipOrder,
  fetchMembershipStatus,
  fetchOrderStatus,
  fetchPaymentMethods,
  fetchPlans,
} from "~/api/membership";
import { signIn } from "~/services/auth";

const PAYMENT_POLL_INTERVAL_MS = 2000;

interface ActiveOrder {
  orderId: string;
  amountFen: number;
  method: PaymentMethod;
  qr: boolean;
  payCode?: string;
  payUrl?: string;
  expiresAt: string | null;
}

const plans = ref<MembershipPlanInfo[]>([]);
const paymentMethods = ref<PaymentMethodInfo[]>([]);
const selectedMethod = ref<PaymentMethod | undefined>(undefined);
const loading = ref(true);
const needLogin = ref(false);
const errorMessage = ref("");
const message = ref("");
const status = ref<Awaited<ReturnType<typeof fetchMembershipStatus>> | null>(null);
const paying = ref("");
const activeOrder = ref<ActiveOrder | null>(null);
const copied = ref(false);
const nowMs = ref(Date.now());

let pollTimer: ReturnType<typeof setInterval> | undefined;
let clockTimer: ReturnType<typeof setInterval> | undefined;

function formatDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("zh-CN");
}

function durationLabel(days: number | null) {
  return days == null ? "永久" : `${days} 天`;
}

function methodLabel(method: PaymentMethod) {
  return paymentMethods.value.find((m) => m.method === method)?.label ?? "支付";
}

const payButtonLabel = computed(() => {
  const method = paymentMethods.value.find((m) => m.method === selectedMethod.value);
  return method ? method.label : "立即开通";
});

const remainingText = computed(() => {
  const expiresAt = activeOrder.value?.expiresAt;
  if (!expiresAt) return "";
  const remaining = Math.max(0, new Date(expiresAt).getTime() - nowMs.value);
  if (remaining === 0) return "订单已过期";
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `剩余 ${minutes}:${String(seconds).padStart(2, "0")}`;
});

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
}

async function loadPlans() {
  try {
    plans.value = await fetchPlans();
  } catch {
    // 加载失败时保持空, 避免展示过期硬编码价格
    plans.value = [];
  }
}

async function loadPaymentMethods() {
  try {
    paymentMethods.value = await fetchPaymentMethods();
  } catch {
    paymentMethods.value = [];
  }
  if (
    !selectedMethod.value ||
    !paymentMethods.value.some((m) => m.method === selectedMethod.value)
  ) {
    selectedMethod.value = paymentMethods.value[0]?.method;
  }
}

function buildActiveOrder(
  orderId: string,
  amountFen: number,
  method: PaymentMethod,
  payload: PaymentPayload | undefined,
  expiresAt: string | null,
): ActiveOrder {
  const meta = paymentMethods.value.find((m) => m.method === method);
  const rawUrl = payload?.payUrl;
  const absoluteUrl = rawUrl && /^https?:\/\//.test(rawUrl) ? rawUrl : undefined;
  return {
    orderId,
    amountFen,
    method,
    qr: Boolean(meta?.qr),
    // 微信 code_url / 支付宝 qr_code / 模拟支付相对链接 (可复制)
    payCode: payload?.codeUrl ?? payload?.qrCode ?? (absoluteUrl ? undefined : rawUrl),
    payUrl: absoluteUrl,
    expiresAt,
  };
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = undefined;
}

/** 轮询服务端订单状态 (服务端会与渠道对账, 前端不信任本地结果) */
function startPolling(orderId: string) {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      const res: OrderStatusResponse = await fetchOrderStatus(orderId);
      if (res.status === "paid") {
        stopPolling();
        activeOrder.value = null;
        message.value = "🎉 开通成功! 会员已生效";
        status.value = await fetchMembershipStatus();
        return;
      }
      if (["failed", "cancelled", "expired", "refunded"].includes(res.status)) {
        stopPolling();
        activeOrder.value = null;
        message.value =
          res.status === "expired" ? "订单已超时关闭, 请重新下单" : "支付未完成, 请重试";
      }
    } catch {
      // 网络抖动: 继续轮询
    }
  }, PAYMENT_POLL_INTERVAL_MS);
}

async function pay(planId: MembershipPlanId) {
  message.value = "";
  paying.value = planId;
  try {
    const idempotencyKey = `${planId}-${Date.now()}`;
    const order = await createMembershipOrder(planId, selectedMethod.value, idempotencyKey);

    if (order.paymentMethod === "mock" && order.providerOrderId) {
      // 开发环境: 触发 mock 支付确认, 随后轮询
      try {
        await confirmMockPay(order.providerOrderId);
      } catch {
        // 忽略: provider 也会在 10 秒后自动置为 paid
      }
    }

    activeOrder.value = buildActiveOrder(
      order.orderId,
      order.amountFen,
      order.paymentMethod,
      order.paymentPayload,
      order.expiresAt ?? null,
    );
    startPolling(order.orderId);
  } catch (e: any) {
    if (e?.status === 401 || e?.statusCode === 401) {
      needLogin.value = true;
    } else if (e?.status === 400 || e?.statusCode === 400) {
      message.value = typeof e?.message === "string" ? e.message : "当前支付方式不可用";
      await loadPaymentMethods();
    } else {
      message.value = "支付失败, 请稍后再试";
    }
  } finally {
    paying.value = "";
  }
}

async function copyPayCode() {
  const code = activeOrder.value?.payCode;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    // 剪贴板不可用时忽略
  }
}

function cancelActiveOrder() {
  stopPolling();
  activeOrder.value = null;
  message.value = "";
}

onMounted(async () => {
  await Promise.all([loadStatus(), loadPlans(), loadPaymentMethods()]);
  clockTimer = setInterval(() => (nowMs.value = Date.now()), 1000);
});

onUnmounted(() => {
  stopPolling();
  if (clockTimer) clearInterval(clockTimer);
});
</script>
