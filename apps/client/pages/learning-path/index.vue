<template>
  <div class="flex w-full flex-col">
    <h2 class="mb-4 text-center text-3xl dark:text-white">课程向导</h2>

    <template v-if="isLoading">
      <Loading></Loading>
    </template>
    <template v-else>
      <div class="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2 sm:px-0 md:grid-cols-3">
        <div
          v-for="path in paths"
          :key="path.id"
          class="learning-path-card cursor-pointer"
          @click="gotoLearningPathDetail(path.id)"
        >
          <figure
            v-if="path.cover"
            class="relative aspect-video overflow-hidden"
          >
            <NuxtImg
              :src="path.cover"
              :placeholder="[288, 180]"
              width="288"
              height="180"
              class="inset-0 h-full w-full object-cover"
            />
          </figure>
          <div class="p-4">
            <h3 class="text-lg font-semibold">{{ path.title }}</h3>
            <p class="mt-1 line-clamp-2 text-sm text-gray-500">{{ path.description }}</p>
            <div class="mt-3 text-xs text-gray-400">{{ path.coursePackCount }} 个课程包</div>
          </div>
        </div>
      </div>

      <p
        v-if="paths.length === 0"
        class="mt-10 text-center text-gray-400"
      >
        暂无课程向导
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";

import type { LearningPathSummary } from "~/types";
import { fetchLearningPaths } from "~/api/learning-path";
import { useNavigation } from "~/composables/useNavigation";

const { gotoLearningPathDetail } = useNavigation();

const paths = ref<LearningPathSummary[]>([]);
const isLoading = ref(false);

onMounted(setup);

async function setup() {
  isLoading.value = true;
  try {
    paths.value = await fetchLearningPaths();
  } finally {
    isLoading.value = false;
  }
}
</script>

<style scoped>
.learning-path-card {
  @apply flex flex-col overflow-hidden rounded-md rounded-t-xl border bg-white transition-all duration-300 dark:border-gray-700 dark:bg-gray-900;
  @apply hover:text-purple-500 hover:shadow-even-lg hover:shadow-gray-300 hover:dark:text-purple-400 dark:hover:shadow-gray-500;
  height: 100%;
}
</style>
