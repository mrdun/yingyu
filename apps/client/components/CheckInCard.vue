<script setup lang="ts">
import dayjs from "dayjs";
import { computed, onMounted, ref } from "vue";

import type { CheckInResponse } from "~/api/coins";
import { checkInTask, fetchCheckInHistory, fetchTodayTasks } from "~/api/coins";
import { fetchStatsOverview } from "~/api/stats";
import CheckInCalendar from "~/components/CheckInCalendar.vue";

const loading = ref(true);
const streak = ref(0);
const cumulativeDays = ref(0);
const checkedIn = ref(false);
const checkingIn = ref(false);
const message = ref("");
const checkedInDates = ref<string[]>([]);
const showCalendar = ref(false);
const dailyGoal = ref({ current: 0, target: 5 });
const todayCheckedIn = ref(false);

const weekDayNames = ["一", "二", "三", "四", "五", "六", "日"];

// Compute current week's Mon-Sun dates (ISO week: Monday start)
const weekDates = computed(() => {
  const today = dayjs();
  const monday = today.day(1); // Monday
  const dates: { dateStr: string; dayName: string; dayOfMonth: number; checked: boolean }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = monday.add(i, "day");
    dates.push({
      dateStr: d.format("YYYY-MM-DD"),
      dayName: weekDayNames[i],
      dayOfMonth: d.date(),
      checked: checkedInDates.value.includes(d.format("YYYY-MM-DD")),
    });
  }
  return dates;
});

async function load() {
  loading.value = true;
  try {
    const [tasksData, historyData, statsData] = await Promise.all([
      fetchTodayTasks(),
      fetchCheckInHistory(),
      fetchStatsOverview(),
    ]);

    const dailyCheckInTask = tasksData.tasks.find((t) => t.taskType === "daily_check_in");
    if (dailyCheckInTask) {
      checkedIn.value = dailyCheckInTask.claimed;
      todayCheckedIn.value = dailyCheckInTask.claimed;
    }

    // Use study_10 task for daily goal progress
    const studyTask = tasksData.tasks.find((t) => t.taskType === "study_10");
    if (studyTask) {
      dailyGoal.value = { current: studyTask.current, target: studyTask.target };
    }

    checkedInDates.value = historyData.dates || [];
    streak.value = statsData.reviewStreak ?? 0;
    cumulativeDays.value = statsData.totalLearnDays ?? 0;
  } catch (e) {
    console.error("Failed to load check-in status", e);
  } finally {
    loading.value = false;
  }
}

async function handleCheckIn() {
  if (checkingIn.value || checkedIn.value) return;

  checkingIn.value = true;
  message.value = "";
  try {
    const res: CheckInResponse = await checkInTask("daily_check_in");
    if (res.granted) {
      streak.value = res.streak;
      checkedIn.value = true;
      todayCheckedIn.value = true;
      message.value = `🎉 打卡成功！连续打卡 ${res.streak} 天`;
      if (res.streakBonus > 0) {
        message.value += `，连击奖励 +${res.streakBonus} 金币！`;
      }
      // Reload history to update weekly grid
      const historyData = await fetchCheckInHistory();
      checkedInDates.value = historyData.dates || [];
    } else if (res.alreadyDone) {
      checkedIn.value = true;
      message.value = "今日已打卡";
    } else {
      message.value = "打卡失败，请稍后再试";
    }
  } catch (e) {
    console.error("Check-in failed", e);
    message.value = "打卡失败，请稍后再试";
  } finally {
    checkingIn.value = false;
  }
}

function toggleCalendar() {
  showCalendar.value = !showCalendar.value;
}

function shareAchievement() {
  // Placeholder for sharing/shine feature
  message.value = "✨ 炫耀战绩功能即将上线！";
}

onMounted(() => {
  load();
});
</script>

<template>
  <div
    class="mb-6 rounded-lg border border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50 p-6 shadow-sm dark:border-purple-700 dark:from-purple-900/20 dark:to-pink-900/20"
  >
    <!-- 连胜 + 累计 -->
    <div class="mb-4 grid grid-cols-2 gap-4">
      <div class="rounded-lg bg-white/70 p-4 text-center dark:bg-gray-800/50">
        <div class="text-3xl font-bold text-orange-500">{{ loading ? "—" : streak }}</div>
        <div class="mt-1 text-xs text-gray-500">🔥 连胜天数</div>
      </div>
      <div class="rounded-lg bg-white/70 p-4 text-center dark:bg-gray-800/50">
        <div class="text-3xl font-bold text-purple-600 dark:text-purple-400">
          {{ loading ? "—" : cumulativeDays }}
        </div>
        <div class="mt-1 text-xs text-gray-500">📅 累计打卡</div>
      </div>
    </div>

    <!-- 今日目标进度条 -->
    <div class="mb-4">
      <div class="mb-1 flex items-center justify-between text-sm">
        <span class="text-gray-600 dark:text-gray-400">今日目标</span>
        <span class="font-medium text-purple-700 dark:text-purple-300">
          {{ dailyGoal.current }} / {{ dailyGoal.target }} 句
        </span>
      </div>
      <div class="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600">
        <div
          class="h-full rounded-full bg-gradient-to-r from-purple-400 to-pink-400 transition-all duration-500"
          :style="{
            width:
              dailyGoal.target > 0
                ? `${Math.min(100, (dailyGoal.current / dailyGoal.target) * 100)}%`
                : '0%',
          }"
        ></div>
      </div>
    </div>

    <!-- 本周打卡格子 -->
    <div class="mb-4">
      <div class="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">本周打卡</div>
      <div class="flex justify-between gap-2">
        <div
          v-for="day in weekDates"
          :key="day.dateStr"
          class="flex flex-col items-center gap-1"
        >
          <div
            class="flex h-8 w-8 items-center justify-center rounded-md text-xs font-medium transition-colors"
            :class="
              day.checked
                ? 'border-2 border-purple-500 bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                : 'border-2 border-dashed border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500'
            "
          >
            {{ day.dayOfMonth }}
          </div>
          <span class="text-[10px] text-gray-400">{{ day.dayName }}</span>
        </div>
      </div>
    </div>

    <!-- 打卡按钮 + 状态 -->
    <div class="mb-4 flex items-center justify-between gap-2">
      <div>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          每日打卡 🪙 +{{ loading ? "5" : "5" }} 金币
        </p>
        <p class="text-xs text-gray-400">连续 3 天额外 +20，连续 7 天额外 +50</p>
      </div>
      <button
        class="btn border-none bg-purple-500 px-5 py-2 text-sm text-white shadow-md hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
        :disabled="loading || checkingIn || checkedIn"
        @click="handleCheckIn"
      >
        <span v-if="loading">加载中...</span>
        <span v-else-if="checkingIn">打卡中...</span>
        <span v-else-if="checkedIn">✅ 已打卡</span>
        <span v-else>立即打卡</span>
      </button>
    </div>

    <p
      v-if="message"
      class="mb-2 text-center text-sm text-purple-600 dark:text-purple-400"
    >
      {{ message }}
    </p>

    <!-- 双按钮：打卡日历 + 炫耀战绩 -->
    <div class="flex gap-3">
      <button
        class="flex flex-1 items-center justify-center gap-1 rounded-lg border border-purple-300 bg-white py-2 text-sm font-medium text-purple-600 transition-colors hover:bg-purple-50 dark:border-purple-600 dark:bg-gray-800 dark:text-purple-400 dark:hover:bg-purple-900/30"
        @click="toggleCalendar"
      >
        📅 {{ showCalendar ? "收起日历" : "打卡日历" }}
      </button>
      <button
        class="flex flex-1 items-center justify-center gap-1 rounded-lg border border-purple-300 bg-white py-2 text-sm font-medium text-purple-600 transition-colors hover:bg-purple-50 dark:border-purple-600 dark:bg-gray-800 dark:text-purple-400 dark:hover:bg-purple-900/30"
        @click="shareAchievement"
      >
        🎯 炫耀战绩
      </button>
    </div>

    <!-- 打卡日历（折叠） -->
    <CheckInCalendar
      v-if="showCalendar"
      class="mt-4"
      :checked-in-dates="checkedInDates"
    />
  </div>
</template>
