<template>
  <div class="w-full py-4">
    <template v-if="isLoading">
      <Loading></Loading>
    </template>
    <template v-else>
      <!-- 轻量返回入口: 从课程广场卡片/学习路线直达练习后, 不必只靠浏览器后退离开 -->
      <div class="mx-auto mb-3 flex w-full max-w-5xl items-center">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 shadow-sm transition-colors hover:border-brand-300 hover:text-brand-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          @click="goBackToCoursePack()"
        >
          ← 返回课程
        </button>
      </div>
      <div
        class="mx-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-[1.35rem] border border-zinc-200/60 bg-white shadow-soft dark:border-zinc-700 dark:bg-zinc-900"
      >
        <MainTool />
        <MainGame />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { navigateTo } from "#app";
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { toast } from "vue-sonner";

import { useGameMode } from "~/composables/main/game";
import { useNavigation } from "~/composables/useNavigation";
import { isAuthenticated } from "~/services/auth";
import { useCourseStore } from "~/store/course";
import { useCoursePackStore } from "~/store/coursePack";
import { useMasteredElementsStore } from "~/store/masteredElements";

const isLoading = ref(true);
const route = useRoute();
const coursePackStore = useCoursePackStore();
const courseStore = useCourseStore();
const masteredElementsStore = useMasteredElementsStore();
const { gotoCourseList } = useNavigation();
const { showQuestion } = useGameMode();

showQuestion();

/** 返回入口指向课程包详情页 (课程列表), 与卡片/学习路线的落点保持一致 */
function goBackToCoursePack() {
  navigateTo(`/course-pack/${route.params.coursePackId as string}`);
}

onMounted(async () => {
  const { coursePackId, id } = route.params;
  if (isAuthenticated()) {
    await masteredElementsStore.setup();
  }
  await courseStore.setup(coursePackId as string, id as string);
  await coursePackStore.setupCoursePack(coursePackId as string);

  if (courseStore.isAllMastered()) {
    toast.info("你已经全部都掌握 自动帮你跳转到课程列表啦", {
      duration: 1500,
      onAutoClose: () => {
        gotoCourseList(coursePackId as string);
      },
    });
    return;
  }
  isLoading.value = false;
});
</script>
