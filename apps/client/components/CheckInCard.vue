<script setup lang="ts">
import { onMounted, ref } from "vue";

import type { CheckInResponse } from "~/api/coins";
import { checkInTask, fetchCheckInHistory, fetchTodayTasks } from "~/api/coins";

const loading = ref(true);
const streak = ref(0);
const checkedIn = ref(false);
const checkingIn = ref(false);
const message = ref("");
const checkedInDates = ref<string[]>([]);
const showCalendar = ref(false);

async function load() {
  loading.value = true;
  try {
    const [tasksData, historyData] = await Promise.all([fetchTodayTasks(), fetchCheckInHistory()]);

    const dailyCheckInTask = tasksData.tasks.find((t) => t.taskType === "daily_check_in");
    if (dailyCheckInTask) {
      checkedIn.value = dailyCheckInTask.claimed;
    }

    checkedInDates.value = historyData.dates || [];
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
      message.value = `🎉 打卡成功！连续打卡 ${res.streak} 天`;
      if (res.streakBonus > 0) {
        message.value += `，连击奖励 +${res.streakBonus} 金币！`;
      }
      // 重新加载打卡历史
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

onMounted(() => {
  load();
});
</script>

<template>
  <div
    class="mb-6 rounded-lg border border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50 p-6 shadow-sm dark:border-purple-700 dark:from-purple-900/20 dark:to-pink-900/20"
  >
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-lg font-semibold text-purple-700 dark:text-purple-300">每日打卡</h3>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          每天打卡记录学习进度，连续打卡赢取奖励！
        </p>
        <div
          v-if="streak > 0"
          class="mt-2 flex items-center gap-2"
        >
          <span class="text-2xl">🔥</span>
          <span class="text-lg font-bold text-orange-500">连续打卡 {{ streak }} 天</span>
        </div>
      </div>

      <div class="text-center">
        <button
          class="btn border-none bg-purple-500 px-6 py-3 text-white shadow-md hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
          :disabled="loading || checkingIn || checkedIn"
          @click="handleCheckIn"
        >
          <span v-if="loading">加载中...</span>
          <span v-else-if="checkingIn">打卡中...</span>
          <span v-else-if="checkedIn">✅ 已打卡</span>
          <span v-else>立即打卡</span>
        </button>
        <p
          v-if="message"
          class="mt-2 text-sm text-purple-600 dark:text-purple-400"
        >
          {{ message }}
        </p>
      </div>
    </div>

    <div class="mt-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
      <span>🪙 +5 金币</span>
      <span>连续 3 天额外 +20，连续 7 天额外 +50</span>
      <button
        class="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
        @click="toggleCalendar"
      >
        {{ showCalendar ? "收起日历" : "查看打卡日历" }}
      </button>
    </div>

    <CheckInCalendar
      v-if="showCalendar"
      class="mt-4"
      :checked-in-dates="checkedInDates"
    />
  </div>
</template>
