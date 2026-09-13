<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
    <header class="mb-6">
      <h1 class="text-2xl font-bold dark:text-white">推广中心</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        把课程推荐给需要的人: 好友通过你的链接注册并购买会员, 你获得佣金。
      </p>
    </header>

    <!-- 未登录 -->
    <div
      v-if="needLogin"
      class="rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-gray-700 dark:bg-gray-800"
    >
      <p class="mb-4 text-gray-500">登录后即可查看推广信息</p>
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

    <div
      v-else-if="loading"
      class="py-16 text-center"
    >
      <span class="loading loading-spinner loading-lg"></span>
    </div>

    <template v-else>
      <!-- 状态提示 -->
      <section
        v-if="partner?.status === 'pending'"
        class="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center dark:border-amber-600/60 dark:bg-amber-900/20"
      >
        <div class="font-semibold text-amber-700 dark:text-amber-300">⏳ 审核中</div>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
          你的 Partner 申请正在审核, 通过后即可获得专属推广链接。
        </p>
      </section>

      <section
        v-else-if="partner?.status === 'suspended' || partner?.status === 'rejected'"
        class="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-center dark:border-red-700 dark:bg-red-900/20"
      >
        <div class="font-semibold text-red-600 dark:text-red-400">
          {{ partner.status === "suspended" ? "推广资格已暂停" : "申请未通过" }}
        </div>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
          当前状态无法继续推广, 如有疑问请联系管理员。
        </p>
      </section>

      <!-- 已是 Partner: 推广链接 + 当前佣金 -->
      <section
        v-if="partner?.status === 'active'"
        class="mb-6 rounded-2xl border border-purple-200 bg-white p-5 shadow-soft dark:border-purple-700 dark:bg-gray-800"
      >
        <div class="font-semibold text-purple-600 dark:text-purple-300">✨ 推广中</div>

        <p class="mt-3 text-sm text-gray-600 dark:text-gray-300">
          当前推广佣金:
          <span class="font-semibold text-purple-600 dark:text-purple-300">
            {{ commissionHeadline }}
          </span>
        </p>
        <ul
          v-if="planCommissionRates.length > 0"
          class="mt-1 space-y-0.5 text-xs text-gray-500 dark:text-gray-400"
        >
          <li
            v-for="rule in planCommissionRates"
            :key="rule.planId"
          >
            {{ planNameOf(rule.planId) }}：{{ rule.percentage }}
          </li>
        </ul>

        <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">你的专属推广链接</p>
        <div class="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            :value="referralLink"
            readonly
            class="input input-sm input-bordered w-full rounded-lg bg-gray-50 text-xs dark:bg-gray-900 sm:text-sm"
          />
          <button
            class="btn btn-sm shrink-0 border-none bg-purple-500 text-white hover:bg-purple-600"
            @click="copyLink"
          >
            {{ copied ? "已复制" : "复制链接" }}
          </button>
        </div>
        <p class="mt-2 text-xs text-gray-400">推广码: {{ partner.referralCode }}</p>
      </section>

      <!-- 非 Partner: 资格与申请 -->
      <section
        v-if="!partner?.isPartner"
        class="mb-6 rounded-2xl border border-gray-200 bg-white p-5 text-center shadow-soft dark:border-gray-700 dark:bg-gray-800"
      >
        <template v-if="isLifetime">
          <p class="text-gray-600 dark:text-gray-300">
            你是终身会员, 可以申请成为推广者并获得推广佣金。
          </p>
          <button
            class="btn mt-4 border-none bg-purple-500 text-white shadow-md hover:bg-purple-600"
            :disabled="applying"
            @click="apply"
          >
            {{ applying ? "申请中…" : "申请成为 Partner" }}
          </button>
        </template>
        <template v-else>
          <p class="text-gray-600 dark:text-gray-300">
            推广资格面向终身会员开放; 开通终身会员后即可申请成为 Partner。
          </p>
          <button
            class="btn mt-4 border-none bg-purple-500 text-white shadow-md hover:bg-purple-600"
            @click="navigateTo('/membership')"
          >
            查看会员方案
          </button>
        </template>
      </section>

      <!-- 推广流程 -->
      <section
        class="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
      >
        <h2 class="text-base font-semibold dark:text-white">怎么赚钱?</h2>
        <ol class="mt-3 grid gap-3 text-sm text-gray-600 dark:text-gray-300 sm:grid-cols-2">
          <li class="flex gap-2">
            <span class="badge badge-outline badge-sm shrink-0">1</span>
            <span>复制你的专属推广链接, 分享给朋友</span>
          </li>
          <li class="flex gap-2">
            <span class="badge badge-outline badge-sm shrink-0">2</span>
            <span>好友通过链接进入并注册/登录 (自动归因, 只归因一次)</span>
          </li>
          <li class="flex gap-2">
            <span class="badge badge-outline badge-sm shrink-0">3</span>
            <span>好友购买会员并支付成功</span>
          </li>
          <li class="flex gap-2">
            <span class="badge badge-outline badge-sm shrink-0">4</span>
            <span>佣金进入你的账户, 好友续费继续产生佣金</span>
          </li>
        </ol>
      </section>

      <!-- 收益示例: 金额来自方案价格 API, 比例来自佣金 API -->
      <section
        v-if="commissionExamples.length > 0"
        class="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
      >
        <h2 class="text-base font-semibold dark:text-white">收益示例</h2>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          按当前佣金比例与方案价格计算 (实际以结算规则为准, 退款订单佣金会撤销):
        </p>
        <ul class="mt-3 divide-y divide-gray-100 text-sm dark:divide-gray-700">
          <li
            v-for="example in commissionExamples"
            :key="example.planId"
            class="flex items-center justify-between py-2"
          >
            <span class="text-gray-600 dark:text-gray-300">
              好友购买{{ example.planName }} (¥{{ formatYuan(example.priceFen) }})
            </span>
            <span class="font-semibold text-purple-600 dark:text-purple-300">
              可得 ¥{{ formatYuan(example.commissionFen) }}
            </span>
          </li>
        </ul>
      </section>

      <!-- 我的推广数据 -->
      <section
        v-if="partner?.status === 'active'"
        class="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-base font-semibold dark:text-white">我的推广数据</h2>
          <span class="text-xs text-gray-400">邀请人数: {{ referrals?.count ?? 0 }}</span>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div
            v-for="card in commissionCards"
            :key="card.label"
            class="rounded-xl bg-gray-50 p-3 text-center dark:bg-gray-900"
          >
            <div class="text-xs text-gray-500">{{ card.label }}</div>
            <div class="mt-1 text-base font-semibold text-gray-800 dark:text-gray-100">
              ¥{{ formatYuan(card.valueFen) }}
            </div>
          </div>
        </div>

        <div
          v-if="referrals && referrals.referrals.length > 0"
          class="mt-4 overflow-x-auto"
        >
          <table class="table table-sm">
            <thead>
              <tr>
                <th>邀请用户</th>
                <th>注册时间</th>
                <th class="text-right">贡献佣金</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, index) in referrals.referrals"
                :key="`${row.createdAt}-${index}`"
              >
                <td>{{ row.username }}</td>
                <td class="text-xs text-gray-500">{{ formatDate(row.createdAt) }}</td>
                <td class="text-right">¥{{ formatYuan(row.commissionFen) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p
          v-else
          class="mt-4 text-sm text-gray-500"
        >
          还没有邀请记录, 分享推广链接后这里会显示好友的购买贡献。
        </p>
      </section>

      <!-- 佣金状态说明 -->
      <section
        class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
      >
        <h2 class="text-base font-semibold dark:text-white">佣金状态说明</h2>
        <ul class="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <li
            v-for="status in commissionStatusList"
            :key="status.key"
            class="flex flex-wrap items-baseline gap-2"
          >
            <span class="badge badge-outline badge-sm shrink-0">{{ status.label }}</span>
            <span class="text-xs text-gray-500 dark:text-gray-400">{{ status.description }}</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import type { MembershipPlanInfo } from "~/api/membership";
import type { PartnerCommissionSummary, PartnerMe, PartnerReferralList } from "~/api/partner";
import { fetchMembershipStatus, fetchPlans } from "~/api/membership";
import {
  applyPartner,
  fetchPartnerCommissions,
  fetchPartnerMe,
  fetchPartnerReferrals,
} from "~/api/partner";
import { signIn } from "~/services/auth";
import { commissionExampleFen, describeCommissionStatus, formatYuan } from "~/utils/membership-ui";

const partner = ref<PartnerMe | null>(null);
const membership = ref<Awaited<ReturnType<typeof fetchMembershipStatus>> | null>(null);
const plans = ref<MembershipPlanInfo[]>([]);
const referrals = ref<PartnerReferralList | null>(null);
const commissionSummary = ref<PartnerCommissionSummary | null>(null);
const loading = ref(true);
const needLogin = ref(false);
const applying = ref(false);
const copied = ref(false);
const errorMessage = ref("");

const origin = typeof window !== "undefined" ? window.location.origin : "";
const referralLink = computed(() =>
  partner.value?.referralCode ? `${origin}/?ref=${partner.value.referralCode}` : "",
);
const isLifetime = computed(() => membership.value?.planId === "lifetime");

/** 佣金比例只来自 API (partner_commission_rules) */
const commissionHeadline = computed(
  () => partner.value?.commission?.percentage ?? "以生效规则为准",
);
const planCommissionRates = computed(() => partner.value?.commission?.plans ?? []);

/** 收益示例: 方案价格 (API) × 佣金比例 (API) */
const commissionExamples = computed(() => {
  const globalRate = partner.value?.commission?.rateBps ?? null;
  if (globalRate === null) return [];

  return plans.value
    .filter((plan) => plan.durationDays !== null) // 永久方案只产生一次佣金, 示例里以订阅方案为主
    .slice(0, 4)
    .map((plan) => {
      const override = planCommissionRates.value.find((rule) => rule.planId === plan.id);
      const rateBps = override ? override.rateBps : globalRate;
      return {
        planId: plan.id,
        planName: plan.name,
        priceFen: plan.priceFen,
        commissionFen: commissionExampleFen(plan.priceFen, rateBps) ?? 0,
      };
    });
});

const commissionCards = computed(() => {
  const summary = commissionSummary.value;
  return [
    { label: "累计佣金(未撤销)", valueFen: summary?.totalCommissionFen ?? 0 },
    { label: describeCommissionStatus("holding").label, valueFen: summary?.holdingFen ?? 0 },
    { label: describeCommissionStatus("pending").label, valueFen: summary?.pendingFen ?? 0 },
    { label: describeCommissionStatus("paid").label, valueFen: summary?.paidFen ?? 0 },
  ];
});

const commissionStatusList = computed(() =>
  ["holding", "pending", "payable", "paid", "reversed"].map((key) => ({
    key,
    ...describeCommissionStatus(key),
  })),
);

function planNameOf(planId: string) {
  return plans.value.find((plan) => plan.id === planId)?.name ?? planId;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN");
}

async function load() {
  loading.value = true;
  needLogin.value = false;
  errorMessage.value = "";
  try {
    const [me, status, planList] = await Promise.all([
      fetchPartnerMe(),
      fetchMembershipStatus(),
      fetchPlans().catch(() => [] as MembershipPlanInfo[]),
    ]);
    partner.value = me;
    membership.value = status;
    plans.value = planList;

    if (me.status === "active") {
      const [referralList, summary] = await Promise.all([
        fetchPartnerReferrals().catch(() => null),
        fetchPartnerCommissions().catch(() => null),
      ]);
      referrals.value = referralList;
      commissionSummary.value = summary;
    }
  } catch (e: any) {
    if (e?.status === 401 || e?.statusCode === 401) {
      needLogin.value = true;
    } else {
      errorMessage.value = "加载推广信息失败, 请稍后再试";
    }
  } finally {
    loading.value = false;
  }
}

async function apply() {
  applying.value = true;
  errorMessage.value = "";
  try {
    partner.value = await applyPartner();
  } catch (e: any) {
    if (e?.status === 401 || e?.statusCode === 401) {
      needLogin.value = true;
      // 「申请成为 Partner」是用户主动动作: 未登录必须去登录 (页面级 401 不再自动跳转)
      signIn();
    } else {
      errorMessage.value = typeof e?.message === "string" ? e.message : "申请失败, 请稍后再试";
    }
  } finally {
    applying.value = false;
  }
}

async function copyLink() {
  if (!referralLink.value) return;
  try {
    await navigator.clipboard.writeText(referralLink.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    // 剪贴板不可用时忽略
  }
}

onMounted(load);
</script>
