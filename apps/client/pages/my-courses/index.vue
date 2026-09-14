<template>
  <div class="mx-auto max-w-4xl px-4 py-10">
    <h1 class="mb-6 text-2xl font-bold">我的课程</h1>

    <!-- 未登录 (游客): 与掌握列表一致, 这里给出明确说明与登录入口 -->
    <div
      v-if="!isAuthenticated()"
      class="rounded-lg bg-gray-50 py-16 text-center dark:bg-gray-800"
    >
      <p class="mb-4 text-lg text-gray-600 dark:text-gray-300">登录后可查看你的课程</p>
      <button
        class="btn border-none bg-purple-500 text-white shadow-md hover:bg-purple-600"
        @click="signIn()"
      >
        登录
      </button>
    </div>

    <template v-else>
      <!-- 最近学习 -->
      <section class="mb-8">
        <div class="mb-4 flex items-center justify-between border-b pb-2 dark:border-gray-700">
          <div class="text-lg font-medium text-gray-800 dark:text-gray-200">最近学习</div>
          <NuxtLink
            to="/course-pack"
            class="link text-sm text-blue-500 no-underline hover:opacity-75"
          >
            课程广场
          </NuxtLink>
        </div>
        <RecentCoursePack />
      </section>

      <!-- 学习卡片区: 复习 / 掌握 / 生词 -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <template
          v-for="card in cards"
          :key="card.title"
        >
          <NuxtLink
            v-if="card.enabled"
            :to="card.to"
            class="rounded-lg border border-gray-200 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-gray-700"
          >
            <div class="mb-2 text-3xl">{{ card.icon }}</div>
            <div class="text-lg font-semibold">{{ card.title }}</div>
            <p class="mt-1 text-sm text-gray-500">{{ card.description }}</p>
            <div class="mt-4 flex items-baseline gap-2">
              <span class="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {{ card.statValue }}
              </span>
              <span class="text-xs text-gray-500">{{ card.statLabel }}</span>
            </div>
          </NuxtLink>
          <!-- 未上线功能: 只做视觉占位, 不给可点击入口 -->
          <div
            v-else
            class="cursor-not-allowed rounded-lg border border-dashed border-gray-200 p-5 opacity-60 dark:border-gray-700"
          >
            <div class="mb-2 text-3xl">{{ card.icon }}</div>
            <div class="text-lg font-semibold">{{ card.title }}</div>
            <p class="mt-1 text-sm text-gray-500">{{ card.description }}</p>
            <div class="mt-4 flex items-baseline gap-2">
              <span class="text-2xl font-bold text-gray-400">开发中</span>
            </div>
          </div>
        </template>
      </div>

      <!-- 课程广场入口: 「暂无课程」时的去处 -->
      <div class="mt-8 text-center">
        <NuxtLink
          to="/course-pack"
          class="btn border-none bg-purple-500 text-white shadow-md hover:bg-purple-600"
        >
          去课程广场逛逛
        </NuxtLink>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import { fetchReviewToday } from "~/api/review";
import RecentCoursePack from "~/components/courses/RecentCoursePack.vue";
import { isAuthenticated, signIn } from "~/services/auth";

// 生词本功能暂未实现, 先占位「开发中」
const isNewWordBookEnabled = false;

const reviewTodayCount = ref<string>("-");

const cards = computed(() => [
  {
    title: "复习本",
    description: "SRS 间隔重复，巩固已学句子",
    to: "/review",
    icon: "🔁",
    statLabel: "今日待复习",
    statValue: reviewTodayCount.value,
    enabled: true,
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
  {
    title: "生词本",
    description: "收藏生词，随时回顾（开发中）",
    to: "/review",
    icon: "📝",
    statLabel: "生词数量",
    statValue: "-",
    enabled: isNewWordBookEnabled,
  },
]);

async function loadReviewTodayCount() {
  if (!isAuthenticated()) return;
  try {
    const queue = await fetchReviewToday();
    reviewTodayCount.value = String(queue.length);
  } catch (e: any) {
    // 401 或其他错误都显示「-」
    reviewTodayCount.value = "-";
  }
}

onMounted(() => {
  loadReviewTodayCount();
});
</script>

<style scoped></style>
