<template>
  <div
    class="mx-auto my-8 w-full max-w-screen-lg space-y-3 rounded-lg bg-white px-6 py-8 shadow-even-lg dark:bg-gray-900 dark:shadow-gray-700 md:px-12"
  >
    <!-- 未登录 (游客): 页面级 401 不再自动跳转登录页, 这里给出明确说明与登录入口 -->
    <div
      v-if="needLogin"
      class="py-16 text-center"
    >
      <p class="mb-4 text-lg text-gray-600 dark:text-gray-300">登录后可查看你的掌握列表</p>
      <button
        class="btn border-none bg-purple-500 text-white shadow-md hover:bg-purple-600"
        @click="signIn()"
      >
        登录
      </button>
    </div>

    <div
      v-else-if="loading"
      class="py-16 text-center text-gray-500"
    >
      加载中...
    </div>

    <div
      v-else-if="errorMessage"
      class="alert alert-error"
    >
      {{ errorMessage }}
    </div>

    <template v-else>
      <div
        v-if="actionErrorMessage"
        class="alert alert-error"
      >
        {{ actionErrorMessage }}
      </div>

      <div class="mb-4 flex items-center justify-between">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search ..."
          class="w-3/4 rounded-lg border p-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <span class="text-gray-600 dark:text-gray-300"
          >Total: {{ masteredElementsStore.totalMasteredElementsCount }}</span
        >
      </div>

      <div
        v-for="item in filteredItems"
        :key="item.id"
        class="flex items-center justify-between rounded-lg bg-purple-100 p-4 transition-colors duration-300 hover:bg-purple-200 dark:bg-purple-700 dark:hover:bg-purple-600"
      >
        <div>
          <div class="text-lg font-bold text-purple-800 dark:text-white">
            {{ item.content.english }}
          </div>
          <div class="text-purple-600 dark:text-purple-300">
            Added on {{ formatDate(item.masteredAt) }}
          </div>
        </div>
        <div
          @click="removeItem(item)"
          class="cursor-pointer transition-transform duration-300 hover:scale-110"
        >
          <UTooltip text="删除">
            <UIcon
              name="i-ph-trash-bold"
              class="h-5 w-5"
            />
          </UTooltip>
        </div>
      </div>

      <p
        v-if="filteredItems.length === 0"
        class="py-8 text-center text-gray-500 dark:text-gray-400"
      >
        {{ searchQuery ? "没有找到匹配的内容" : "还没有掌握的内容, 学习时点击「掌握」即可加入" }}
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import Fuse from "fuse.js";
import { computed, onMounted, ref } from "vue";

import type { MasteredElement } from "~/types/models/mastered-elements";
import { signIn } from "~/services/auth";
import { useMasteredElementsStore } from "~/store/masteredElements";

const masteredElementsStore = useMasteredElementsStore();
const searchQuery = ref("");
const loading = ref(true);
const needLogin = ref(false);
const errorMessage = ref("");
const actionErrorMessage = ref("");

const fuse = computed(
  () =>
    new Fuse(masteredElementsStore.masteredElements, {
      keys: ["content.english"],
      threshold: 0.4,
    }),
);

const filteredItems = computed(() => {
  if (!searchQuery.value) return masteredElementsStore.masteredElements;
  return fuse.value.search(searchQuery.value).map((result) => result.item);
});

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toISOString().split("T")[0];
}

async function load() {
  loading.value = true;
  needLogin.value = false;
  errorMessage.value = "";
  try {
    await masteredElementsStore.setup();
  } catch (e: any) {
    if (e?.status === 401 || e?.statusCode === 401) {
      // 游客: 显示登录提示, 由用户点「登录」显式调用 signIn()
      needLogin.value = true;
    } else {
      errorMessage.value = "加载掌握列表失败, 请稍后再试";
    }
  } finally {
    loading.value = false;
  }
}

async function removeItem(item: MasteredElement) {
  actionErrorMessage.value = "";
  try {
    await masteredElementsStore.removeElement(item.id + "");
  } catch (e: any) {
    if (e?.status === 401 || e?.statusCode === 401) {
      needLogin.value = true;
      // 「删除」是用户主动动作: 未登录必须去登录
      signIn();
    } else {
      actionErrorMessage.value = "删除失败, 请稍后再试";
    }
  }
}

onMounted(load);
</script>

<style scoped></style>
