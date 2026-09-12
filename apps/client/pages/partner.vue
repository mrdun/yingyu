<template>
  <div class="mx-auto max-w-3xl p-6">
    <h1 class="mb-2 text-2xl font-bold dark:text-white">推广中心</h1>
    <p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
      推荐新会员购买后, 你将按当前生效的佣金规则获得佣金。
    </p>

    <div
      v-if="needLogin"
      class="text-center"
    >
      <p class="mb-4 text-gray-500">登录后即可查看推广信息</p>
      <button
        class="btn border-none bg-purple-500 text-white shadow-md hover:bg-purple-600"
        @click="signIn()"
      >
        登录
      </button>
    </div>

    <template v-else-if="!loading">
      <!-- active Partner: 推广链接 -->
      <div
        v-if="partner?.status === 'active'"
        class="mb-6 rounded-2xl border p-5 shadow-soft"
      >
        <div class="font-semibold text-purple-600 dark:text-purple-300">✨ 推广中</div>
        <!-- 佣金比例全部来自后端规则, 规则调整后自动更新 -->
        <p class="mt-3 text-sm text-gray-600 dark:text-gray-300">
          当前推广佣金：
          <span class="font-semibold text-purple-600 dark:text-purple-300">
            {{ headlineCommission }}
          </span>
        </p>
        <ul
          v-if="planCommissions.length > 0"
          class="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400"
        >
          <li
            v-for="plan in planCommissions"
            :key="plan.planId"
          >
            {{ planLabels[plan.planId] ?? plan.planId }}：{{ plan.percentage }}
          </li>
        </ul>
        <p class="mt-2 text-sm text-gray-500">你的推广链接</p>
        <div class="mt-2 flex items-center gap-2">
          <input
            :value="referralLink"
            readonly
            class="input input-sm input-bordered w-full rounded-lg bg-gray-50"
          />
          <button
            class="btn btn-sm border-none bg-purple-500 text-white hover:bg-purple-600"
            @click="copyLink"
          >
            {{ copied ? "已复制" : "复制" }}
          </button>
        </div>
        <p class="mt-2 text-xs text-gray-400">推广码: {{ partner.referralCode }}</p>
      </div>

      <!-- pending -->
      <div
        v-else-if="partner?.status === 'pending'"
        class="mb-6 rounded-2xl border p-5 text-center shadow-soft"
      >
        <div class="font-semibold text-amber-600 dark:text-amber-400">⏳ 审核中</div>
        <p class="mt-2 text-sm text-gray-500">你的 Partner 申请正在审核, 请稍候。</p>
      </div>

      <!-- suspended / rejected -->
      <div
        v-else-if="partner?.status === 'suspended' || partner?.status === 'rejected'"
        class="mb-6 rounded-2xl border p-5 text-center shadow-soft"
      >
        <div class="font-semibold text-red-600 dark:text-red-400">
          {{ partner.status === "suspended" ? "已暂停" : "已拒绝" }}
        </div>
        <p class="mt-2 text-sm text-gray-500">当前状态无法进行推广, 如有疑问请联系管理员。</p>
      </div>

      <!-- 尚未成为 Partner -->
      <div
        v-else
        class="mb-6 rounded-2xl border p-5 text-center shadow-soft"
      >
        <template v-if="isLifetime">
          <p class="text-gray-600 dark:text-gray-300">你是终身会员, 可以申请成为推广者</p>
          <button
            class="btn mt-4 border-none bg-purple-500 text-white shadow-md hover:bg-purple-600"
            :disabled="applying"
            @click="apply"
          >
            {{ applying ? "申请中…" : "申请成为 Partner" }}
          </button>
        </template>
        <template v-else>
          <p class="text-gray-600 dark:text-gray-300">成为推广者需要先开通终身会员</p>
          <button
            class="btn mt-4 border-none bg-purple-500 text-white shadow-md hover:bg-purple-600"
            @click="navigateTo('/membership')"
          >
            查看会员方案
          </button>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useRuntimeConfig } from "#app";
import { computed, onMounted, ref } from "vue";

import type { MembershipPlanInfo } from "~/api/membership";
import type { PartnerMe } from "~/api/partner";
import { fetchMembershipStatus, fetchPlans } from "~/api/membership";
import { applyPartner, fetchPartnerMe } from "~/api/partner";
import { signIn } from "~/services/auth";

const partner = ref<PartnerMe | null>(null);
const membership = ref<Awaited<ReturnType<typeof fetchMembershipStatus>> | null>(null);
const plans = ref<MembershipPlanInfo[]>([]);
const loading = ref(true);
const needLogin = ref(false);
const applying = ref(false);
const copied = ref(false);

const runtimeConfig = useRuntimeConfig();
const origin = typeof window !== "undefined" ? window.location.origin : "";
const referralLink = computed(() =>
  partner.value?.referralCode ? `${origin}/?ref=${partner.value.referralCode}` : "",
);
const isLifetime = computed(() => membership.value?.planId === "lifetime");

// 佣金展示完全来自 API (partner_commission_rules), 前端不硬编码、不换算
const headlineCommission = computed(
  () => partner.value?.commission?.percentage ?? "以生效规则为准",
);
const planCommissions = computed(() => partner.value?.commission?.plans ?? []);
const planLabels = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  for (const plan of plans.value) map[plan.id] = plan.name;
  return map;
});

async function load() {
  loading.value = true;
  needLogin.value = false;
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
    }
  } finally {
    loading.value = false;
  }
}

async function apply() {
  applying.value = true;
  try {
    partner.value = await applyPartner();
  } catch (e: any) {
    if (e?.status === 401 || e?.statusCode === 401) {
      needLogin.value = true;
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
    // 剪贴板不可用时静默忽略
  }
}

onMounted(load);
</script>
