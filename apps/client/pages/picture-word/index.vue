<template>
  <div class="flex w-full flex-col">
    <h2 class="mb-1 text-center text-3xl dark:text-white">看图学词</h2>
    <p class="mb-6 text-center text-sm text-gray-400">点击卡片查看单词</p>

    <template v-if="isLoading">
      <Loading></Loading>
    </template>
    <template v-else>
      <div class="grid grid-cols-2 gap-4 px-4 sm:grid-cols-3 sm:px-0 md:grid-cols-4 lg:grid-cols-5">
        <div
          v-for="word in words"
          :key="word.id"
          class="picture-word-card cursor-pointer"
          @click="toggle(word.id)"
        >
          <template v-if="!flipped.has(word.id)">
            <figure class="relative aspect-square overflow-hidden">
              <NuxtImg
                :src="word.imageUrl"
                :placeholder="[200, 200]"
                width="200"
                height="200"
                class="inset-0 h-full w-full object-cover"
              />
            </figure>
            <div class="p-2 text-center text-xs text-gray-400">点击查看</div>
          </template>
          <template v-else>
            <div class="flex h-full flex-col items-center justify-center gap-1 p-3 text-center">
              <div class="text-lg font-bold text-purple-600 dark:text-purple-400">
                {{ word.word }}
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-300">{{ word.chinese }}</div>
              <div
                v-if="word.soundmark"
                class="text-xs text-gray-400"
              >
                {{ word.soundmark }}
              </div>
              <div
                v-if="word.exampleSentence"
                class="mt-2 line-clamp-3 text-xs text-gray-500"
              >
                {{ word.exampleSentence }}
              </div>
            </div>
          </template>
        </div>
      </div>

      <p
        v-if="words.length === 0"
        class="mt-10 text-center text-gray-400"
      >
        暂无看图学词内容
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";

import type { PictureWord } from "~/types";
import { fetchPictureWords } from "~/api/picture-word";

const words = ref<PictureWord[]>([]);
const isLoading = ref(false);
const flipped = ref(new Set<string>());

onMounted(setup);

async function setup() {
  isLoading.value = true;
  try {
    words.value = await fetchPictureWords();
  } finally {
    isLoading.value = false;
  }
}

function toggle(id: string) {
  const next = new Set(flipped.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  flipped.value = next;
}
</script>

<style scoped>
.picture-word-card {
  @apply flex flex-col overflow-hidden rounded-md border bg-white transition-all duration-300 dark:border-gray-700 dark:bg-gray-900;
  @apply hover:shadow-even-lg hover:shadow-gray-300 dark:hover:shadow-gray-500;
  aspect-ratio: 1 / 1.2;
}
</style>
