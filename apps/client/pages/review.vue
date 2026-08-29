<script setup lang="ts">
import type { ReviewQueueItem } from "~/api/review";
import { fetchReviewAnswer, fetchReviewToday } from "~/api/review";

const queue = ref<ReviewQueueItem[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const revealed = ref<Record<string, boolean>>({});
const answering = ref("");

async function loadQueue() {
  loading.value = true;
  errorMessage.value = "";
  try {
    queue.value = await fetchReviewToday();
    revealed.value = {};
  } catch (e: any) {
    if (e?.status === 401 || e?.statusCode === 401) {
      errorMessage.value = "请先登录";
    } else {
      errorMessage.value = "加载复习队列失败，请稍后再试";
    }
  } finally {
    loading.value = false;
  }
}

async function answer(item: ReviewQueueItem, quality: number) {
  answering.value = item.statementId;
  try {
    await fetchReviewAnswer(item.statementId, quality);
  } catch (e: any) {
    if (e?.status === 401 || e?.statusCode === 401) {
      errorMessage.value = "请先登录";
    } else {
      errorMessage.value = "提交失败，请稍后再试";
    }
  } finally {
    answering.value = "";
    await loadQueue();
  }
}

onMounted(() => {
  loadQueue();
});
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 py-10">
    <h1 class="mb-6 text-2xl font-bold">复习</h1>

    <div
      v-if="loading"
      class="text-gray-500"
    >
      加载中...
    </div>

    <div
      v-else-if="errorMessage"
      class="text-red-500"
    >
      {{ errorMessage }}
    </div>

    <div
      v-else-if="queue.length === 0"
      class="rounded-lg bg-gray-50 py-16 text-center text-lg dark:bg-gray-800"
    >
      今日复习已完成🎉
    </div>

    <div
      v-else
      class="space-y-4"
    >
      <p class="text-sm text-gray-500">今日待复习 {{ queue.length }} 条</p>
      <div
        v-for="item in queue"
        :key="item.statementId"
        class="rounded-lg border border-gray-200 p-5 shadow-sm dark:border-gray-700"
      >
        <div class="mb-3 text-lg font-medium">{{ item.chinese }}</div>

        <div
          v-if="!revealed[item.statementId]"
          class="mb-4"
        >
          <button
            class="text-sm text-blue-500 hover:underline"
            @click="revealed[item.statementId] = true"
          >
            显示英文
          </button>
        </div>
        <div
          v-else
          class="mb-4"
        >
          <div class="text-xl">{{ item.english }}</div>
          <div
            v-if="item.soundmark"
            class="text-sm text-gray-500"
          >
            {{ item.soundmark }}
          </div>
        </div>

        <div class="flex gap-3">
          <button
            class="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600 disabled:opacity-50"
            :disabled="answering === item.statementId"
            @click="answer(item, 4)"
          >
            记住(4)
          </button>
          <button
            class="rounded bg-yellow-500 px-4 py-2 text-white hover:bg-yellow-600 disabled:opacity-50"
            :disabled="answering === item.statementId"
            @click="answer(item, 3)"
          >
            模糊(3)
          </button>
          <button
            class="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600 disabled:opacity-50"
            :disabled="answering === item.statementId"
            @click="answer(item, 1)"
          >
            忘了(1)
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
