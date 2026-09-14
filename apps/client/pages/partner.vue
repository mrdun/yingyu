<template>
  <!--
    「合伙人招募」= 资格 / 申请 / 怎么赚钱 / 收益示例 (把课程推荐给需要的人)。
    专属链接、邀请记录、佣金明细在 /promotion (推广返利) —— 两页各司其职:
    本页回答「我能不能做、怎么做」, 那页回答「我赚了多少、钱到哪一步了」。
  -->
  <div class="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
    <header class="mb-6">
      <h1 class="text-2xl font-bold dark:text-white">合伙人招募</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        把课程推荐给需要的人: 好友通过你的链接注册并购买会员, 你获得佣金。
      </p>
    </header>

    <!-- 未登录 -->
    <div
      v-if="needLogin"
      class="rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-gray-700 dark:bg-gray-800"
    >
      <p class="mb-4 text-gray-500">登录后即可查看合伙人资格</p>
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

      <!-- 已是 Partner: 只给去向, 不重复放链接与佣金面板 (那些在推广返利页) -->
      <section
        v-if="partner?.status === 'active'"
        class="mb-6 rounded-2xl border border-purple-200 bg-white p-5 shadow-soft dark:border-purple-700 dark:bg-gray-800"
      >
        <div class="font-semibold text-purple-600 dark:text-purple-300">✨ 你已是合伙人</div>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
          专属推广链接、邀请记录与佣金明细都在「推广返利」页。
        </p>
        <!-- 用 NuxtLink 做跳转, 不在模板里调用 navigateTo:
             模板里调它会被 tsc 判为「不存在的属性」(Nuxt 自动导入对类型检查不可见),
             而页面跳转本来就该是链接语义 -->
        <NuxtLink
          to="/promotion"
          class="btn mt-4 border-none bg-purple-500 text-white shadow-md hover:bg-purple-600"
        >
          去看我的推广返利
        </NuxtLink>
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
          <NuxtLink
            to="/membership"
            class="btn mt-4 border-none bg-purple-500 text-white shadow-md hover:bg-purple-600"
          >
            查看会员方案
          </NuxtLink>
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
        class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
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
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import type { MembershipPlanInfo } from "~/api/membership";
import type { PartnerMe } from "~/api/partner";
import { fetchMembershipStatus, fetchPlans } from "~/api/membership";
import { applyPartner, fetchPartnerMe } from "~/api/partner";
import { signIn } from "~/services/auth";
import { commissionExampleFen, formatYuan } from "~/utils/membership-ui";

/**
 * 本页只做「能不能做 / 怎么申请」; 链接与佣金面板在 /promotion。
 * 所以这里不再拉 referrals / commissions —— 少两个请求, 也不会与那页的数字打架。
 */
const partner = ref<PartnerMe | null>(null);
const membership = ref<Awaited<ReturnType<typeof fetchMembershipStatus>> | null>(null);
const plans = ref<MembershipPlanInfo[]>([]);
const loading = ref(true);
const needLogin = ref(false);
const applying = ref(false);
const errorMessage = ref("");

const isLifetime = computed(() => membership.value?.planId === "lifetime");

/** 佣金比例只来自 API (partner_commission_rules) */
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
  } catch (e: any) {
    if (e?.status === 401 || e?.statusCode === 401) {
      needLogin.value = true;
    } else {
      errorMessage.value = "加载合伙人信息失败, 请稍后再试";
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

onMounted(load);
</script>
