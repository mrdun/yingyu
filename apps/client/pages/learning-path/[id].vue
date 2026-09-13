<template>
  <div class="flex w-full flex-col">
    <template v-if="isLoading">
      <Loading></Loading>
    </template>
    <template v-else-if="path">
      <div class="mb-6">
        <h2 class="text-2xl font-bold dark:text-white">{{ path.title }}</h2>
        <p class="mt-2 text-gray-500">{{ path.description }}</p>
      </div>

      <div
        v-for="item in path.items"
        :key="item.order"
        class="mb-8"
      >
        <div
          v-if="item.stage"
          class="mb-3 flex items-center gap-2 text-lg font-medium text-gray-700 dark:text-gray-200"
        >
          <span
            class="rounded-full bg-purple-100 px-3 py-1 text-sm text-purple-600 dark:bg-gray-800 dark:text-purple-400"
          >
            {{ item.stage }}
          </span>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          <CoursePackCard
            :coursePack="item.coursePack"
            :show-action="false"
            @cardClick="handleGoToCoursePack"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { navigateTo, useRoute } from "#app";
import { ref } from "vue";

import type { LearningPathDetail } from "~/types";
import { fetchCoursePack } from "~/api/course-pack";
import { fetchLearningPath } from "~/api/learning-path";
import CoursePackCard from "~/components/courses/CoursePackCard.vue";
import type { CoursePackCardModel } from "~/utils/coursePackEntry";
import { resolveCoursePackFirstLessonPath } from "~/utils/coursePackEntry";

const route = useRoute();

const path = ref<LearningPathDetail>();
const isLoading = ref(false);

setup();

async function setup() {
  const pathId = route.params.id as string;
  isLoading.value = true;
  try {
    path.value = await fetchLearningPath(pathId);
  } finally {
    isLoading.value = false;
  }
}

/**
 * 学习路线条目直达该课程包第一课的练习。
 * 路线数据只有「课程包 + stage」, 没有 courseId, 所以这里取一次课程包详情;
 * 取不到 / 包内无课程 / 会员课无权限 → 兜底课程包详情页 (现状行为), 不卡住也不报错。
 */
async function handleGoToCoursePack(coursePack: CoursePackCardModel) {
  const target = await resolveCoursePackFirstLessonPath(
    () => fetchCoursePack(coursePack.id),
    coursePack.id,
  );
  await navigateTo(target.path);
}
</script>
