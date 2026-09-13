<template>
  <div class="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
    <header class="mb-6">
      <h1 class="text-2xl font-bold dark:text-white">会员计划</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        开通会员即可解锁全部课程; 所有价格与权益以本页实时展示为准。
      </p>
    </header>

    <!-- 未登录: 游客仍可见方案与价格, 点「登录」或「立即开通」时才跳转登录 -->
    <div
      v-if="needLogin"
      class="mb-6 rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-gray-700 dark:bg-gray-800"
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
      class="alert alert-error"
    >
      {{ errorMessage }}
    </div>

    <template v-if="!errorMessage">
      <!-- 已是会员: 直接给出下一步 -->
      <section
        v-if="status?.isMember"
        class="mb-6 rounded-2xl border border-purple-200 bg-purple-50 p-5 dark:border-purple-700 dark:bg-purple-900/30"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="font-semibold text-purple-700 dark:text-purple-300">✨ 会员生效中</div>
            <div class="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {{ currentPlanName }} ·
              {{ status.endDate ? `有效期至 ${formatDate(status.endDate)}` : "永久有效" }}
            </div>
          </div>
          <button
            class="btn border-none bg-purple-500 text-white hover:bg-purple-600"
            @click="goToCourse()"
          >
            去学习课程 →
          </button>
        </div>
      </section>

      <!-- 产品价值 + 会员权益 (权益来自 API) -->
      <section
        v-if="!status?.isMember"
        class="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
      >
        <h2 class="text-base font-semibold dark:text-white">为什么开通会员?</h2>
        <ul class="mt-3 grid gap-2 text-sm text-gray-600 dark:text-gray-300 sm:grid-cols-2">
          <li>· 解锁全部会员课程, 不再受单课限制</li>
          <li>· 学习路线 / 复习 / 成长报告全部可用</li>
          <li>· 新增课程持续更新, 会员期内直接学习</li>
          <li>· 一次开通, 到期前不重复扣费</li>
        </ul>
        <div
          v-if="benefitList.length > 0"
          class="mt-4 border-t border-gray-100 pt-3 dark:border-gray-700"
        >
          <div class="text-xs font-medium text-gray-400">会员权益</div>
          <div class="mt-2 flex flex-wrap gap-2">
            <span
              v-for="benefit in benefitList"
              :key="benefit"
              class="rounded-full bg-purple-50 px-3 py-1 text-xs text-purple-700 dark:bg-purple-900/40 dark:text-purple-200"
            >
              {{ benefit }}
            </span>
          </div>
        </div>
      </section>

      <!-- 永久会员重点展示 (数据驱动: 无永久方案时不渲染) -->
      <section
        v-if="!status?.isMember && lifetimePlan"
        class="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-600/60 dark:bg-amber-900/20"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="font-semibold text-amber-700 dark:text-amber-300">
              {{ lifetimePlan.name }} · 一次购买, 永久有效
            </div>
            <p class="mt-1 text-sm text-amber-700/80 dark:text-amber-200/80">
              买断后长期可用, 无需每年续费 (不含任何未承诺的额外权益)。
            </p>
          </div>
          <div class="text-right">
            <div class="text-2xl font-bold text-amber-700 dark:text-amber-200">
              ¥{{ formatYuan(lifetimePlan.priceFen) }}
            </div>
            <button
              class="btn btn-sm mt-2 border-none bg-amber-500 text-white hover:bg-amber-600"
              :disabled="!!paying || !!activeOrder"
              @click="pay(lifetimePlan.id)"
            >
              {{ paying === lifetimePlan.id ? "处理中…" : "开通永久会员" }}
            </button>
          </div>
        </div>
      </section>

      <!-- 支付方式 (由服务端渠道开关决定) -->
      <section
        v-if="!status?.isMember && paymentMethods.length > 0"
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
            :disabled="!!paying || !!activeOrder"
            @click="selectedMethod = method.method"
          >
            {{ method.label }}
          </button>
        </div>
      </section>

      <!-- 支付过程: 等待 / 成功 / 失败 / 超时 -->
      <section
        v-if="paymentStage !== 'idle'"
        class="mb-6 rounded-2xl border p-5 shadow-soft"
        :class="paymentPanelClass"
      >
        <!-- 等待支付 -->
        <template v-if="paymentStage === 'waiting' && activeOrder">
          <div class="flex items-center gap-3">
            <span class="loading loading-spinner loading-md text-purple-500"></span>
            <div>
              <div class="font-semibold text-purple-700 dark:text-purple-300">正在等待支付…</div>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                已开启自动检测, 支付完成后本页会自动确认
                <span v-if="remainingText"> · {{ remainingText }}</span>
              </p>
            </div>
          </div>

          <div class="mt-3 text-sm text-gray-600 dark:text-gray-300">
            {{ methodLabel(activeOrder.method) }} · 应付 ¥{{ formatYuan(activeOrder.amountFen) }}
          </div>

          <div
            v-if="activeOrder.payCode"
            class="mt-3"
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
            class="mt-3"
          >
            <a
              :href="activeOrder.payUrl"
              class="btn btn-sm border-none bg-purple-500 text-white hover:bg-purple-600"
            >
              前往支付页面
            </a>
          </div>

          <div class="mt-4 flex flex-wrap gap-2">
            <button
              class="btn btn-outline btn-xs"
              :disabled="checking"
              @click="checkPaymentNow()"
            >
              {{ checking ? "检测中…" : "我已完成支付, 立即检测" }}
            </button>
            <button
              class="btn btn-ghost btn-xs"
              @click="cancelActiveOrder()"
            >
              取消 / 重新选择
            </button>
          </div>
        </template>

        <!-- 支付成功 -->
        <template v-else-if="paymentStage === 'success'">
          <div class="font-semibold text-green-700 dark:text-green-300">
            🎉 支付成功, 会员已生效
          </div>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {{ successSummary }}
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <button
              class="btn btn-sm border-none bg-purple-500 text-white hover:bg-purple-600"
              @click="goToCourse()"
            >
              进入课程 →
            </button>
            <button
              class="btn btn-ghost btn-sm"
              @click="resetPaymentPanel()"
            >
              继续查看方案
            </button>
          </div>
        </template>

        <!-- 支付失败 -->
        <template v-else-if="paymentStage === 'failed'">
          <div class="font-semibold text-red-600 dark:text-red-400">支付未完成</div>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {{ failedReason }}
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <button
              class="btn btn-sm border-none bg-purple-500 text-white hover:bg-purple-600"
              :disabled="!!paying"
              @click="retryPayment()"
            >
              {{ paying ? "处理中…" : "重新支付" }}
            </button>
            <button
              class="btn btn-ghost btn-sm"
              @click="resetPaymentPanel()"
            >
              重新选择方案
            </button>
          </div>
        </template>

        <!-- 订单关闭 / 超时 -->
        <template v-else-if="paymentStage === 'expired'">
          <div class="font-semibold text-amber-700 dark:text-amber-300">订单已关闭</div>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
            订单超时未支付已自动关闭, 未产生任何扣费, 可以重新购买。
          </p>
          <div class="mt-4">
            <button
              class="btn btn-sm border-none bg-purple-500 text-white hover:bg-purple-600"
              :disabled="!!paying"
              @click="retryPayment()"
            >
              {{ paying ? "处理中…" : "重新购买" }}
            </button>
          </div>
        </template>
      </section>

      <!-- 方案对比 (卡片数量自适应, 后台新增方案不会破版);
           游客也能先浏览价格, 点「立即开通」时才跳转登录 -->
      <section v-if="!status?.isMember">
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-base font-semibold dark:text-white">选择方案</h2>
          <span
            v-if="recommendedPlan"
            class="text-xs text-gray-400"
          >
            已按每天成本标注推荐方案
          </span>
        </div>

        <div
          class="grid gap-4"
          style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))"
        >
          <article
            v-for="plan in plans"
            :key="plan.id"
            class="flex min-w-0 flex-col rounded-2xl border bg-white p-5 shadow-soft transition-all hover:-translate-y-1 hover:shadow-soft-lg dark:bg-gray-800"
            :class="
              plan.id === recommendedPlan?.id
                ? 'border-purple-400 ring-1 ring-purple-200 dark:border-purple-500'
                : 'border-gray-200 dark:border-gray-700'
            "
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="truncate text-lg font-semibold dark:text-white">{{ plan.name }}</div>
                <div class="text-xs text-gray-500">{{ durationLabel(plan.durationDays) }}</div>
              </div>
              <span
                v-if="plan.id === recommendedPlan?.id"
                class="shrink-0 rounded-full bg-purple-500 px-2 py-0.5 text-xs text-white"
              >
                最划算
              </span>
              <span
                v-else-if="isLifetime(plan)"
                class="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-xs text-white"
              >
                永久有效
              </span>
            </div>

            <div class="my-3">
              <span class="text-3xl font-bold text-purple-600 dark:text-purple-400">
                ¥{{ formatYuan(plan.priceFen) }}
              </span>
              <span
                v-if="dailyPrice(plan)"
                class="ml-2 text-xs text-gray-400"
              >
                约 ¥{{ formatYuan(dailyPrice(plan) as number) }}/天
              </span>
            </div>

            <div
              v-if="savingOf(plan)"
              class="mb-2 text-xs text-green-600 dark:text-green-400"
            >
              相比月付省 ¥{{ formatYuan(savingOf(plan)!.savedFen) }} ({{
                savingOf(plan)!.discountPercent
              }}% off)
            </div>

            <ul
              v-if="benefitsOf(plan).length > 0"
              class="mb-4 space-y-1 text-xs text-gray-600 dark:text-gray-300"
            >
              <li
                v-for="benefit in benefitsOf(plan)"
                :key="benefit"
              >
                ✓ {{ benefit }}
              </li>
            </ul>

            <button
              class="btn mt-auto w-full border-none bg-purple-500 text-white shadow-md hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
              :disabled="!!paying || !!activeOrder"
              @click="pay(plan.id)"
            >
              {{ paying === plan.id ? "处理中…" : payButtonLabel }}
            </button>
            <p class="mt-2 text-center text-[11px] text-gray-400">
              开通后立即生效, 到期自动结束, 不自动续费
            </p>
          </article>
        </div>

        <p
          v-if="plans.length === 0"
          class="mt-6 text-center text-sm text-gray-400"
        >
          暂无可购买的会员方案, 请稍后再试。
        </p>
      </section>

      <p class="mt-6 text-center text-xs text-gray-400">
        支付由微信/支付宝官方渠道完成, 订单金额以服务端计算为准; 支付结果以服务端确认为准。
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
import type { DisplayPlan, PaymentStage } from "~/utils/membership-ui";
import {
  confirmMockPay,
  createMembershipOrder,
  fetchMembershipStatus,
  fetchOrderStatus,
  fetchPaymentMethods,
  fetchPlans,
} from "~/api/membership";
import { signIn } from "~/services/auth";
import {
  compareWithMonthly,
  dailyPriceFen,
  describeEntitlements,
  formatYuan,
  paymentStageOf,
  pickLifetimePlan,
  pickRecommendedPlan,
} from "~/utils/membership-ui";

const PAYMENT_POLL_INTERVAL_MS = 2000;
const PAYMENT_POLL_MAX_MS = 10 * 60 * 1000; // 兜底上限: 10 分钟后停止轮询 (订单本身仍会按时关闭)

interface ActiveOrder {
  orderId: string;
  planId: string;
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
const status = ref<Awaited<ReturnType<typeof fetchMembershipStatus>> | null>(null);
const paying = ref("");
const checking = ref(false);
const copied = ref(false);
const activeOrder = ref<ActiveOrder | null>(null);
const paymentStage = ref<PaymentStage>("idle");
const lastPaidPlanId = ref<string | null>(null);
const failedReason = ref("支付未完成或已取消, 可以重新发起支付。");
const nowMs = ref(Date.now());

let pollTimer: ReturnType<typeof setInterval> | undefined;
let pollDeadline = 0;
let clockTimer: ReturnType<typeof setInterval> | undefined;

/** 展示用方案 (统一成 DisplayPlan, 便于复用纯函数) */
const displayPlans = computed<DisplayPlan[]>(() =>
  plans.value.map((plan) => ({
    id: plan.id,
    name: plan.name,
    priceFen: plan.priceFen,
    durationDays: plan.durationDays,
    entitlements: plan.entitlements ?? [],
  })),
);

const recommendedPlan = computed(() => pickRecommendedPlan(displayPlans.value));
const lifetimePlan = computed(() => pickLifetimePlan(displayPlans.value));

/**
 * 当前会员方案名称: 用 planId 在方案列表里查名字。
 * 不展示后端 legacy 字段 membership.type (值为 regular/founder, 对用户无意义)。
 */
const currentPlanName = computed(() => {
  const planId = status.value?.planId;
  if (!planId) return "会员";
  return plans.value.find((plan) => plan.id === planId)?.name ?? "会员";
});

const monthlyPlan = computed(
  () =>
    displayPlans.value.find((plan) => plan.durationDays !== null && plan.durationDays <= 31) ??
    null,
);

/** 会员权益汇总 (来自各方案的 entitlements 并集) */
const benefitList = computed(() => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const plan of displayPlans.value) {
    for (const benefit of describeEntitlements(plan.entitlements)) {
      if (!seen.has(benefit)) {
        seen.add(benefit);
        result.push(benefit);
      }
    }
  }
  return result;
});

const payButtonLabel = computed(() => {
  const method = paymentMethods.value.find((item) => item.method === selectedMethod.value);
  return method ? `用${method.label}开通` : "立即开通";
});

const remainingText = computed(() => {
  const expiresAt = activeOrder.value?.expiresAt;
  if (!expiresAt) return "";
  const remaining = Math.max(0, new Date(expiresAt).getTime() - nowMs.value);
  if (remaining === 0) return "订单即将关闭";
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `剩余 ${minutes}:${String(seconds).padStart(2, "0")}`;
});

const successSummary = computed(() => {
  const endDate = status.value?.endDate;
  if (!endDate) return "你现在可以学习全部会员课程了。";
  return `你现在可以学习全部会员课程, 有效期至 ${formatDate(endDate)}。`;
});

const paymentPanelClass = computed(() => {
  switch (paymentStage.value) {
    case "success":
      return "border-green-200 bg-green-50 dark:border-green-700 dark:bg-green-900/20";
    case "failed":
      return "border-red-200 bg-red-50 dark:border-red-700 dark:bg-red-900/20";
    case "expired":
      return "border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20";
    default:
      return "border-purple-200 bg-white dark:border-purple-700 dark:bg-gray-800";
  }
});

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN");
}

function durationLabel(days: number | null) {
  return days == null ? "永久有效" : `${days} 天`;
}

function isLifetime(plan: MembershipPlanInfo) {
  return plan.durationDays === null;
}

function dailyPrice(plan: MembershipPlanInfo) {
  return dailyPriceFen({
    id: plan.id,
    name: plan.name,
    priceFen: plan.priceFen,
    durationDays: plan.durationDays,
    entitlements: plan.entitlements ?? [],
  });
}

function savingOf(plan: MembershipPlanInfo) {
  return compareWithMonthly(
    {
      id: plan.id,
      name: plan.name,
      priceFen: plan.priceFen,
      durationDays: plan.durationDays,
      entitlements: plan.entitlements ?? [],
    },
    monthlyPlan.value,
  );
}

function benefitsOf(plan: MembershipPlanInfo) {
  return describeEntitlements(plan.entitlements ?? []);
}

function methodLabel(method: PaymentMethod) {
  return paymentMethods.value.find((item) => item.method === method)?.label ?? "支付";
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
}

async function loadPlans() {
  try {
    plans.value = await fetchPlans();
  } catch {
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
    !paymentMethods.value.some((method) => method.method === selectedMethod.value)
  ) {
    selectedMethod.value = paymentMethods.value[0]?.method;
  }
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = undefined;
}

function resetPaymentPanel() {
  stopPolling();
  activeOrder.value = null;
  paymentStage.value = "idle";
  failedReason.value = "支付未完成或已取消, 可以重新发起支付。";
}

/** 用服务端订单状态驱动展示 (前端不判定支付结果) */
function startPolling(orderId: string) {
  stopPolling();
  pollDeadline = Date.now() + PAYMENT_POLL_MAX_MS;
  pollTimer = setInterval(async () => {
    if (Date.now() > pollDeadline) {
      stopPolling();
      return;
    }
    try {
      const order: OrderStatusResponse = await fetchOrderStatus(orderId);
      const stage = paymentStageOf(order.status);
      if (stage === "waiting") return;

      stopPolling();
      paymentStage.value = stage;
      if (stage === "success") {
        lastPaidPlanId.value = order.planId;
        status.value = await fetchMembershipStatus();
      } else if (stage === "expired") {
        activeOrder.value = null;
      } else {
        failedReason.value =
          order.status === "refunded"
            ? "该订单已退款, 如需继续使用请重新购买。"
            : "支付未完成或已取消, 可以重新发起支付。";
      }
    } catch {
      // 网络抖动: 继续轮询
    }
  }, PAYMENT_POLL_INTERVAL_MS);
}

async function pay(planId: MembershipPlanId) {
  // 「立即开通」是用户主动动作: 未登录时直接去登录 (页面级 401 不再自动跳转)
  if (needLogin.value) {
    signIn();
    return;
  }
  errorMessage.value = "";
  paying.value = planId;
  try {
    const order = await createMembershipOrder(
      planId,
      selectedMethod.value,
      `${planId}-${Date.now()}`,
    );

    if (order.paymentMethod === "mock" && order.providerOrderId) {
      try {
        await confirmMockPay(order.providerOrderId);
      } catch {
        // 忽略: mock provider 也会在 10 秒后自动置为 paid
      }
    }

    const payload: PaymentPayload | undefined = order.paymentPayload;
    const rawUrl = payload?.payUrl;
    activeOrder.value = {
      orderId: order.orderId,
      planId,
      amountFen: order.amountFen,
      method: order.paymentMethod,
      qr: Boolean(paymentMethods.value.find((item) => item.method === order.paymentMethod)?.qr),
      payCode:
        payload?.codeUrl ??
        payload?.qrCode ??
        (/^https?:\/\//.test(rawUrl ?? "") ? undefined : rawUrl),
      payUrl: /^https?:\/\//.test(rawUrl ?? "") ? rawUrl : undefined,
      expiresAt: order.expiresAt ?? null,
    };
    paymentStage.value = "waiting";
    startPolling(order.orderId);
  } catch (e: any) {
    const code = e?.status ?? e?.statusCode;
    if (code === 401) {
      needLogin.value = true;
      // 明确要开通却没有有效登录态 (例如会话过期) → 回到登录页
      signIn();
    } else if (code === 400) {
      failedReason.value =
        typeof e?.message === "string" ? e.message : "当前支付方式不可用, 请重新选择。";
      paymentStage.value = "failed";
      await Promise.all([loadPlans(), loadPaymentMethods()]);
    } else {
      failedReason.value = "发起支付失败, 请检查网络后重试。";
      paymentStage.value = "failed";
    }
  } finally {
    paying.value = "";
  }
}

async function checkPaymentNow() {
  if (!activeOrder.value) return;
  checking.value = true;
  try {
    const order = await fetchOrderStatus(activeOrder.value.orderId);
    const stage = paymentStageOf(order.status);
    if (stage === "waiting") {
      failedReason.value = "尚未检测到支付结果, 完成支付后会自动确认。";
      return;
    }
    paymentStage.value = stage;
    if (stage === "success") {
      status.value = await fetchMembershipStatus();
    } else if (stage === "expired") {
      activeOrder.value = null;
    }
  } catch {
    // 检测失败不改变当前状态
  } finally {
    checking.value = false;
  }
}

async function retryPayment() {
  const planId = activeOrder.value?.planId ?? lastPaidPlanId.value ?? plans.value[0]?.id;
  resetPaymentPanel();
  if (!planId) {
    await loadPlans();
    return;
  }
  await pay(planId);
}

function cancelActiveOrder() {
  resetPaymentPanel();
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

async function goToCourse() {
  await navigateTo("/course-pack");
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
