<script setup lang="ts">
import { onMounted, ref } from "vue";

import type { CheckInResponse, TodayTask } from "~/api/coins";
import { checkInTask, fetchTodayTasks } from "~/api/coins";

const loading = ref(true);
const tasks = ref<TodayTask[]>([]);
const claiming = ref("");
const message = ref("");

async function load() {
  loading.value = true;
  try {
    const tasksData = await fetchTodayTasks();
    tasks.value = tasksData.tasks;
  } catch (e) {
    console.error("Failed to load daily tasks", e);
  } finally {
    loading.value = false;
  }
}

async function claim(task: TodayTask) {
  message.value = "";
  claiming.value = task.taskType;
  try {
    const res: CheckInResponse = await checkInTask(task.taskType);
    if (res.granted) {
      message.value = `🎉 获得 ${res.rewardCoins} 金币${res.streakBonus > 0 ? `，连击奖励 +${res.streakBonus} 金币！` : "！"}`;
    } else if (res.alreadyDone) {
      message.value = "今日已领取过该任务奖励";
    } else {
      message.value = "还未达到任务条件，先去完成吧";
    }
  } catch (e) {
    console.error("Claim failed", e);
    message.value = "领取失败，请稍后再试";
  } finally {
    claiming.value = "";
    await load();
  }
}

function getTask(taskType: string): TodayTask | undefined {
  return tasks.value.find((t) => t.taskType === taskType);
}

// Filter out daily_check_in — it's shown in CheckInCard; show study tasks here
const displayTaskTypes = ["study_10", "sss_once"];

onMounted(() => {
  load();
});
</script>

<template>
  <div
    class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
  >
    <h3 class="mb-4 text-base font-semibold text-gray-800 dark:text-gray-200">📋 每日任务</h3>

    <div
      v-if="loading"
      class="py-4 text-center text-sm text-gray-400"
    >
      加载中...
    </div>

    <div
      v-else
      class="space-y-3"
    >
      <!-- 今日打卡 (always shown) -->
      <div
        class="flex items-center justify-between rounded-lg border p-3"
        :class="
          getTask('daily_check_in')?.claimed
            ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/30'
            : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
        "
      >
        <div class="flex items-center gap-2">
          <span class="text-lg">📅</span>
          <div>
            <div class="text-sm font-medium dark:text-white">
              今日打卡
              <span
                v-if="getTask('daily_check_in')?.claimed"
                class="ml-1 text-green-600"
                >✅</span
              >
            </div>
            <div class="text-xs text-gray-400">连续打卡赢取额外奖励</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-amber-500">
            🪙{{ getTask("daily_check_in")?.rewardCoins ?? 5 }}
          </span>
          <button
            v-if="!getTask('daily_check_in')?.claimed"
            class="btn btn-xs border-none bg-purple-500 text-white hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
            :disabled="!getTask('daily_check_in')?.goalMet || claiming === 'daily_check_in'"
            @click="claim(getTask('daily_check_in')!)"
          >
            {{ getTask("daily_check_in")?.goalMet ? "领取" : "未完成" }}
          </button>
          <span
            v-else
            class="text-xs font-medium text-green-600"
          >
            已领取
          </span>
        </div>
      </div>

      <!-- 学习 10 句 -->
      <div
        v-if="getTask('study_10')"
        class="flex items-center justify-between rounded-lg border p-3"
        :class="
          getTask('study_10')?.claimed
            ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/30'
            : getTask('study_10')?.goalMet
              ? 'border-purple-300 bg-white dark:border-purple-600 dark:bg-gray-800'
              : 'border-gray-200 bg-gray-50 opacity-70 dark:border-gray-700 dark:bg-gray-800'
        "
      >
        <div class="flex items-center gap-2">
          <span class="text-lg">📖</span>
          <div>
            <div class="text-sm font-medium dark:text-white">
              学习 {{ getTask("study_10")?.target }} 句
              <span
                v-if="getTask('study_10')?.claimed"
                class="ml-1 text-green-600"
                >✅</span
              >
            </div>
            <div class="text-xs text-gray-400">
              进度 {{ getTask("study_10")?.current }}/{{ getTask("study_10")?.target }}
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-amber-500">
            🪙{{ getTask("study_10")?.rewardCoins }}
          </span>
          <button
            v-if="!getTask('study_10')?.claimed"
            class="btn btn-xs border-none bg-purple-500 text-white hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
            :disabled="!getTask('study_10')?.goalMet || claiming === 'study_10'"
            @click="claim(getTask('study_10')!)"
          >
            {{ getTask("study_10")?.goalMet ? "领取" : "未完成" }}
          </button>
          <span
            v-else
            class="text-xs font-medium text-green-600"
          >
            已领取
          </span>
        </div>
      </div>

      <!-- SSS 评级 -->
      <div
        v-if="getTask('sss_once')"
        class="flex items-center justify-between rounded-lg border p-3"
        :class="
          getTask('sss_once')?.claimed
            ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/30'
            : getTask('sss_once')?.goalMet
              ? 'border-purple-300 bg-white dark:border-purple-600 dark:bg-gray-800'
              : 'border-gray-200 bg-gray-50 opacity-70 dark:border-gray-700 dark:bg-gray-800'
        "
      >
        <div class="flex items-center gap-2">
          <span class="text-lg">🏆</span>
          <div>
            <div class="text-sm font-medium dark:text-white">
              获得一次 SSS 评级
              <span
                v-if="getTask('sss_once')?.claimed"
                class="ml-1 text-green-600"
                >✅</span
              >
            </div>
            <div class="text-xs text-gray-400">
              进度 {{ getTask("sss_once")?.current }}/{{ getTask("sss_once")?.target }}
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-amber-500">
            🪙{{ getTask("sss_once")?.rewardCoins }}
          </span>
          <button
            v-if="!getTask('sss_once')?.claimed"
            class="btn btn-xs border-none bg-purple-500 text-white hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
            :disabled="!getTask('sss_once')?.goalMet || claiming === 'sss_once'"
            @click="claim(getTask('sss_once')!)"
          >
            {{ getTask("sss_once")?.goalMet ? "领取" : "未完成" }}
          </button>
          <span
            v-else
            class="text-xs font-medium text-green-600"
          >
            已领取
          </span>
        </div>
      </div>
    </div>

    <p
      v-if="message"
      class="mt-3 text-center text-xs text-purple-600 dark:text-purple-400"
    >
      {{ message }}
    </p>
  </div>
</template>
