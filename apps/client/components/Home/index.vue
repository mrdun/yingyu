<template>
  <div class="mx-auto mt-6 flex w-full max-w-screen-xl gap-6 px-4">
    <!-- 左侧导航 -->
    <div class="hidden w-52 shrink-0 md:block">
      <div class="sticky top-16 max-h-[calc(100vh-4rem)] self-start overflow-y-auto">
        <WorkNav />
      </div>
    </div>

    <!-- 中间主内容区 -->
    <div class="min-w-0 flex-1">
      <CheckInCard />

      <DailyTasksCard class="mb-6" />

      <!-- 我的课程 -->
      <div class="mb-4 flex items-center justify-between border-b pb-2 dark:border-gray-700">
        <div class="text-lg font-medium text-gray-800 dark:text-gray-200">我的课程</div>
        <NuxtLink
          href="/course-pack"
          class="link text-sm text-blue-500 no-underline hover:opacity-75"
        >
          课程包商城
        </NuxtLink>
      </div>
      <HomeRecentCoursePack />

      <!-- 平板/手机上的 CalendarGraph -->
      <HomeCalendarGraph
        class="mt-8 lg:hidden"
        :data="learningDailyTimeList"
        :totalLearningTime="learningDailyTotalTime"
        @toggleYear="toggleYear"
      />
    </div>

    <!-- 右侧热力图（桌面端） -->
    <div class="hidden w-[340px] shrink-0 lg:block">
      <div class="sticky top-16">
        <HomeCalendarGraph
          :data="learningDailyTimeList"
          :totalLearningTime="learningDailyTotalTime"
          @toggleYear="toggleYear"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAsyncData } from "#imports";
import { ref } from "vue";

import { fetchTodayLearningTime } from "~/api/user-learning-activity";
import CheckInCard from "~/components/CheckInCard.vue";
import DailyTasksCard from "~/components/DailyTasksCard.vue";
import HomeCalendarGraph from "~/components/Home/CalendarGraph.vue";
import HomeRecentCoursePack from "~/components/Home/RecentCoursePack.vue";
import WorkNav from "~/components/WorkNav.vue";
import { useLearningDailyTime } from "~/composables/learningDailyTime";
import { useLearningTimeTracker } from "~/composables/main/learningTimeTracker";
import { type CalendarDataItem } from "~/composables/user/calendarGraph";

const { learningDailyTimeList, learningDailyTotalTime, setupLearningDailyTime } =
  useLearningDailyTime();
const { toggleYear } = useCalendarGraph();

useAsyncData(async () => {
  // 同步今日的学习总时长
  const { setupLearningTime } = useLearningTimeTracker();
  setupLearningTime(await fetchTodayLearningTime());
});

function useCalendarGraph() {
  const data = ref<CalendarDataItem[]>([]);
  const totalLearningTime = ref<number>(0);

  async function toggleYear(year?: number) {
    setupLearningDailyTime();
  }

  return {
    data,
    totalLearningTime,
    toggleYear,
  };
}
</script>

<style scoped></style>
