<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import type { DailyStat, StatsOverview } from "~/api/stats";
import { fetchStatsDaily, fetchStatsOverview } from "~/api/stats";
import { signIn } from "~/services/auth";

const loading = ref(true);
const needLogin = ref(false);
const errorMessage = ref("");
const overview = ref<StatsOverview | null>(null);
const daily = ref<DailyStat[]>([]);

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0 && m === 0) return "0m";
  return `${h}h ${m}m`;
}

const CHART_WIDTH = 900;
const CHART_HEIGHT = 220;
const CHART_PADDING = { top: 10, right: 10, bottom: 24, left: 30 };

const bars = computed(() => {
  const data = daily.value;
  if (data.length === 0) return [];
  const max = Math.max(...data.map((d) => d.statements), 1);
  const innerW = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const innerH = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const step = innerW / data.length;
  const barW = Math.max(step * 0.6, 2);
  return data.map((d, i) => {
    const h = (d.statements / max) * innerH;
    return {
      ...d,
      x: CHART_PADDING.left + i * step + (step - barW) / 2,
      y: CHART_PADDING.top + innerH - h,
      width: barW,
      height: Math.max(h, d.statements > 0 ? 2 : 0),
    };
  });
});

async function loadStats() {
  loading.value = true;
  errorMessage.value = "";
  needLogin.value = false;
  try {
    const [overviewData, dailyData] = await Promise.all([
      fetchStatsOverview(),
      fetchStatsDaily(30),
    ]);
    overview.value = overviewData;
    daily.value = dailyData;
  } catch (e: any) {
    if (e?.status === 401 || e?.statusCode === 401) {
      needLogin.value = true;
    } else {
      errorMessage.value = "加载报告失败，请稍后再试";
    }
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadStats();
});
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 py-10">
    <h1 class="mb-6 text-2xl font-bold">成长报告</h1>

    <div
      v-if="loading"
      class="text-gray-500"
    >
      加载中...
    </div>

    <div
      v-else-if="needLogin"
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
      v-else-if="errorMessage"
      class="text-red-500"
    >
      {{ errorMessage }}
    </div>

    <template v-else-if="overview">
      <!-- 统计卡片 -->
      <div class="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div
          class="rounded-lg border border-gray-200 p-5 text-center shadow-sm dark:border-gray-700"
        >
          <div class="text-3xl font-bold text-purple-600 dark:text-purple-400">
            {{ overview.totalLearnDays }}
          </div>
          <div class="mt-1 text-sm text-gray-500">累计学习天数</div>
        </div>
        <div
          class="rounded-lg border border-gray-200 p-5 text-center shadow-sm dark:border-gray-700"
        >
          <div class="text-3xl font-bold text-purple-600 dark:text-purple-400">
            {{ overview.totalStatements }}
          </div>
          <div class="mt-1 text-sm text-gray-500">累计练习句数</div>
        </div>
        <div
          class="rounded-lg border border-gray-200 p-5 text-center shadow-sm dark:border-gray-700"
        >
          <div class="text-3xl font-bold text-purple-600 dark:text-purple-400">
            {{ formatDuration(overview.totalLearnDurationSeconds) }}
          </div>
          <div class="mt-1 text-sm text-gray-500">累计学习时长</div>
        </div>
        <div
          class="rounded-lg border border-gray-200 p-5 text-center shadow-sm dark:border-gray-700"
        >
          <div class="text-3xl font-bold text-purple-600 dark:text-purple-400">
            {{ overview.reviewStreak }}
          </div>
          <div class="mt-1 text-sm text-gray-500">连续复习天数</div>
        </div>
      </div>

      <!-- 30 天柱状图 -->
      <div class="rounded-lg border border-gray-200 p-5 shadow-sm dark:border-gray-700">
        <h2 class="mb-4 text-lg font-medium">近 30 天每日练习句数</h2>
        <div class="overflow-x-auto">
          <svg
            :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`"
            class="w-full min-w-[600px]"
            role="img"
            aria-label="近30天每日练习句数柱状图"
          >
            <line
              v-for="i in 4"
              :key="i"
              :x1="CHART_PADDING.left"
              :x2="CHART_WIDTH - CHART_PADDING.right"
              :y1="
                CHART_PADDING.top +
                ((CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom) / 4) * (i - 1)
              "
              :y2="
                CHART_PADDING.top +
                ((CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom) / 4) * (i - 1)
              "
              stroke="currentColor"
              class="text-gray-200 dark:text-gray-700"
              stroke-width="1"
            />
            <rect
              v-for="bar in bars"
              :key="bar.date"
              :x="bar.x"
              :y="bar.y"
              :width="bar.width"
              :height="bar.height"
              rx="2"
              class="fill-purple-500 hover:fill-purple-600"
            >
              <title>{{ bar.date }}: {{ bar.statements }} 句</title>
            </rect>
            <text
              v-for="(bar, i) in bars"
              :key="`label-${bar.date}`"
              :x="bar.x + bar.width / 2"
              :y="CHART_HEIGHT - 6"
              text-anchor="middle"
              class="fill-gray-500 text-[10px]"
            >
              {{ i % 5 === 0 || i === bars.length - 1 ? bar.date.slice(5) : "" }}
            </text>
          </svg>
        </div>
      </div>
    </template>
  </div>
</template>
