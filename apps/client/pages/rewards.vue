<script setup lang="ts">
import type { CheckInResponse, CoinBalance, TodayTask } from "~/api/coins";
import { checkInTask, fetchCoinBalance, fetchTodayTasks } from "~/api/coins";
import { signIn } from "~/services/auth";

const loading = ref(true);
const needLogin = ref(false);
const errorMessage = ref("");
const message = ref("");
const balance = ref<CoinBalance | null>(null);
const tasks = ref<TodayTask[]>([]);
const claiming = ref("");

async function load() {
  loading.value = true;
  errorMessage.value = "";
  needLogin.value = false;
  try {
    const [balanceData, tasksData] = await Promise.all([fetchCoinBalance(), fetchTodayTasks()]);
    balance.value = balanceData;
    tasks.value = tasksData.tasks;
  } catch (e: any) {
    if (e?.status === 401 || e?.statusCode === 401) {
      needLogin.value = true;
    } else {
      errorMessage.value = "加载奖励失败，请稍后再试";
    }
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
      message.value =
        `🎉 获得 ${res.rewardCoins} 金币` +
        (res.streakBonus > 0 ? `，连击奖励 +${res.streakBonus} 金币！` : "！");
    } else if (res.alreadyDone) {
      message.value = "今日已领取过该任务奖励";
    } else {
      message.value = "还未达到任务条件，先去完成吧";
    }
  } catch (e: any) {
    if (e?.status === 401 || e?.statusCode === 401) {
      needLogin.value = true;
    } else {
      message.value = "领取失败，请稍后再试";
    }
  } finally {
    claiming.value = "";
    await load();
  }
}

onMounted(() => {
  load();
});
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 py-10">
    <h1 class="mb-6 text-2xl font-bold">奖励</h1>

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

    <template v-else>
      <!-- 金币余额 -->
      <div class="mb-8 grid grid-cols-2 gap-4">
        <div
          class="rounded-lg border border-gray-200 p-5 text-center shadow-sm dark:border-gray-700"
        >
          <div class="text-3xl font-bold text-amber-500">🪙 {{ balance?.coins ?? 0 }}</div>
          <div class="mt-1 text-sm text-gray-500">金币总余额</div>
        </div>
        <div
          class="rounded-lg border border-gray-200 p-5 text-center shadow-sm dark:border-gray-700"
        >
          <div class="text-3xl font-bold text-purple-600 dark:text-purple-400">
            +{{ balance?.todayEarned ?? 0 }}
          </div>
          <div class="mt-1 text-sm text-gray-500">今日已赚</div>
        </div>
      </div>

      <p
        v-if="message"
        class="mb-4 text-center text-sm text-purple-600 dark:text-purple-400"
      >
        {{ message }}
      </p>

      <!-- 今日任务 -->
      <div class="space-y-3">
        <div
          v-for="task in tasks"
          :key="task.taskType"
          class="flex items-center justify-between rounded-lg border p-4 shadow-sm"
          :class="
            task.claimed
              ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/30'
              : task.goalMet
                ? 'border-purple-300 bg-white dark:border-purple-600 dark:bg-gray-800'
                : 'border-gray-200 bg-gray-50 opacity-70 dark:border-gray-700 dark:bg-gray-800'
          "
        >
          <div>
            <div class="font-medium dark:text-white">
              <span v-if="task.claimed">✅</span>
              {{ task.label }}
            </div>
            <div class="text-sm text-gray-500">进度 {{ task.current }}/{{ task.target }}</div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-amber-500">🪙{{ task.rewardCoins }}</span>
            <button
              v-if="!task.claimed"
              class="btn btn-sm border-none bg-purple-500 text-white shadow-md hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
              :disabled="!task.goalMet || claiming === task.taskType"
              @click="claim(task)"
            >
              {{ task.goalMet ? "领取" : "未完成" }}
            </button>
            <span
              v-else
              class="text-sm font-medium text-green-600 dark:text-green-400"
            >
              ✅ 已领取
            </span>
          </div>
        </div>
      </div>

      <p class="mt-6 text-sm text-gray-500 dark:text-gray-400">
        连续 3 天完成任务额外 +20 金币，连续 7 天额外 +50 金币。
      </p>
    </template>
  </div>
</template>
