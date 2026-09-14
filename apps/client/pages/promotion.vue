<template>
  <!--
    「推广返利」= 用户自己的推广数据面板 (专属链接 / 邀请记录 / 佣金状态)。
    与「合伙人招募」(/partner) 拆成两项, 对标目标站侧栏的两项:
      合伙人招募 = 申请与资格说明; 推广返利 = 我的链接与收益。
  -->
  <div class="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
    <header class="mb-6">
      <h1 class="text-2xl font-bold dark:text-white">推广返利</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        好友通过你的专属链接注册并购买会员, 佣金自动进入你的账户。
      </p>
    </header>

    <!-- 未登录 -->
    <div
      v-if="needLogin"
      class="rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-gray-700 dark:bg-gray-800"
    >
      <p class="mb-4 text-gray-500">登录后即可查看你的推广数据</p>
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
      <!-- 审核中 / 已暂停: 先把状态说清楚, 不给一个空面板 -->
      <section
        v-if="partner?.status === 'pending'"
        class="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-600/60 dark:bg-amber-900/20"
      >
        <div class="font-semibold text-amber-700 dark:text-amber-300">⏳ 合伙人申请审核中</div>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
          审核通过后, 这里会显示你的专属推广链接与佣金。
        </p>
      </section>

      <section
        v-else-if="partner?.status === 'suspended' || partner?.status === 'rejected'"
        class="rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-700 dark:bg-red-900/20"
      >
        <div class="font-semibold text-red-600 dark:text-red-400">
          {{ partner.status === "suspended" ? "推广资格已暂停" : "合伙人申请未通过" }}
        </div>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
          当前状态无法继续推广, 如有疑问请联系管理员。
        </p>
      </section>

      <!-- 不是合伙人: 指向「合伙人招募」, 这里不放申请表单 (两个入口各司其职) -->
      <section
        v-else-if="!partner?.isPartner"
        class="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-soft dark:border-gray-700 dark:bg-gray-800"
      >
        <p class="text-gray-600 dark:text-gray-300">
          你还不是合伙人, 成为合伙人后才可以获得推广链接与佣金。
        </p>
        <NuxtLink
          to="/partner"
          class="btn mt-4 border-none bg-purple-500 text-white shadow-md hover:bg-purple-600"
        >
          去看合伙人招募
        </NuxtLink>
      </section>

      <template v-else>
        <!-- 专属推广链接 + 当前佣金 -->
        <section
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

        <!-- 我的推广数据 -->
        <section
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
      </template>

      <!-- 佣金状态说明: 与身份无关, 任何人都能看 (解释钱到哪一步了) -->
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
import { fetchPlans } from "~/api/membership";
import { fetchPartnerCommissions, fetchPartnerMe, fetchPartnerReferrals } from "~/api/partner";
import { signIn } from "~/services/auth";
import { describeCommissionStatus, formatYuan } from "~/utils/membership-ui";

/**
 * 本页只读「我的推广数据」(链接 / 佣金 / 邀请记录)。
 * 申请成为合伙人在 /partner —— 两页不重复放同一张申请表, 避免两个入口两种状态。
 */
const partner = ref<PartnerMe | null>(null);
const plans = ref<MembershipPlanInfo[]>([]);
const referrals = ref<PartnerReferralList | null>(null);
const commissionSummary = ref<PartnerCommissionSummary | null>(null);
const loading = ref(true);
const needLogin = ref(false);
const copied = ref(false);
const errorMessage = ref("");

const origin = typeof window !== "undefined" ? window.location.origin : "";
const referralLink = computed(() =>
  partner.value?.referralCode ? `${origin}/?ref=${partner.value.referralCode}` : "",
);

/** 佣金比例只来自 API (partner_commission_rules) */
const commissionHeadline = computed(
  () => partner.value?.commission?.percentage ?? "以生效规则为准",
);
const planCommissionRates = computed(() => partner.value?.commission?.plans ?? []);

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
    const [me, planList] = await Promise.all([
      fetchPartnerMe(),
      fetchPlans().catch(() => [] as MembershipPlanInfo[]),
    ]);
    partner.value = me;
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
      errorMessage.value = "加载推广数据失败, 请稍后再试";
    }
  } finally {
    loading.value = false;
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
