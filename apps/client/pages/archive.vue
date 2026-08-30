<script setup lang="ts">
import { fetchReviewToday } from "~/api/review";
import { isAuthenticated, signIn } from "~/services/auth";

const loading = ref(true);
const todayCount = ref<string>("-");

// 生词本功能暂未实现, 先占位「开发中」
const isNewWordBookEnabled = false;

const cards = computed(() => [
  {
    title: "复习本",
    description: "SRS 间隔重复，巩固已学句子",
    to: "/review",
    icon: "🔁",
    statLabel: "今日待复习",
    statValue: todayCount.value,
    enabled: true,
  },
  {
    title: "生词本",
    description: "收藏生词，随时回顾（开发中）",
    to: "/review",
    icon: "📝",
    statLabel: "生词数量",
    statValue: "-",
    enabled: isNewWordBookEnabled,
  },
  {
    title: "掌握列表",
    description: "查看已掌握的句子与进度",
    to: "/mastered-elements",
    icon: "✅",
    statLabel: "掌握数量",
    statValue: "-",
    enabled: true,
  },
]);

async function loadCounts() {
  loading.value = true;
  try {
    if (isAuthenticated()) {
      try {
        const queue = await fetchReviewToday();
        todayCount.value = String(queue.length);
      } catch (e: any) {
        // 401 或其他错误都显示「-」
        todayCount.value = "-";
      }
    }
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadCounts();
});
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 py-10">
    <h1 class="mb-6 text-2xl font-bold">学习档案</h1>

    <div
      v-if="!isAuthenticated()"
      class="rounded-lg bg-gray-50 py-16 text-center dark:bg-gray-800"
    >
      <p class="mb-4 text-lg text-gray-600 dark:text-gray-300">请先登录</p>
      <button
        class="btn border-none bg-purple-500 text-white shadow-md hover:bg-purple-600"
        @click="signIn()"
      >
        登录
      </button>
    </div>

    <div
      v-else-if="loading"
      class="text-gray-500"
    >
      加载中...
    </div>

    <div
      v-else
      class="grid grid-cols-1 gap-4 sm:grid-cols-3"
    >
      <NuxtLink
        v-for="card in cards"
        :key="card.title"
        :to="card.to"
        class="rounded-lg border border-gray-200 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-gray-700"
      >
        <div class="mb-2 text-3xl">{{ card.icon }}</div>
        <div class="text-lg font-semibold">{{ card.title }}</div>
        <p class="mt-1 text-sm text-gray-500">{{ card.description }}</p>
        <div class="mt-4 flex items-baseline gap-2">
          <span class="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {{ card.enabled ? card.statValue : "-" }}
          </span>
          <span class="text-xs text-gray-500">{{ card.statLabel }}</span>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
