<template>
  <div class="flex w-full flex-col">
    <template v-if="isLoading">
      <Loading></Loading>
    </template>

    <template v-else>
      <h2 class="mb-4 text-center text-3xl dark:border-gray-600">
        {{ coursePackStore.currentCoursePack?.title }}
      </h2>
      <div class="h-full scrollbar-hide">
        <div
          class="grid h-[79vh] grid-cols-1 justify-start gap-8 overflow-y-auto overflow-x-hidden pb-96 pl-0 pr-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          <template
            v-for="course in coursePackStore.currentCoursePack?.courses"
            :key="course.id"
          >
            <div class="relative">
              <CoursesCourseCard
                :title="course.title"
                :description="course.description"
                :id="course.id"
                :count="course.completionCount"
                :coursePackId="course.coursePackId"
                @click="handleChangeCourse(course.id)"
              />
              <!-- 历史最高评级徽章 -->
              <div
                v-if="ratingMap[course.id]"
                class="absolute -right-2 -top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border text-sm font-extrabold shadow"
                :class="badgeClass(ratingMap[course.id].grade)"
                :title="`得分率 ${ratingMap[course.id].scoreRate}%`"
              >
                {{ ratingMap[course.id].grade }}
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { navigateTo } from "#app";
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";

import { fetchCourseRatings } from "~/api/course";
import { useActiveCourseMap } from "~/composables/courses/activeCourse";
import { isAuthenticated } from "~/services/auth";
import { useCoursePackStore } from "~/store/coursePack";

const isLoading = ref(false);
const route = useRoute();
const coursePackStore = useCoursePackStore();
const coursePackId = route.params.id as string;
const { updateActiveCourseMap } = useActiveCourseMap();

const ratings = ref<Awaited<ReturnType<typeof fetchCourseRatings>>>([]);
const ratingMap = computed(() => {
  const map: Record<string, { grade: string; scoreRate: number }> = {};
  ratings.value.forEach((r) => {
    map[r.courseId] = { grade: r.grade, scoreRate: r.scoreRate };
  });
  return map;
});

function badgeClass(grade: string) {
  switch (grade) {
    case "SSS":
      return "border-yellow-400 bg-gradient-to-r from-yellow-300 to-amber-500 text-white";
    case "SS":
      return "border-purple-400 bg-purple-100 text-purple-600";
    case "S":
      return "border-blue-400 bg-blue-100 text-blue-600";
    case "A":
      return "border-green-400 bg-green-100 text-green-600";
    case "B":
      return "border-yellow-300 bg-yellow-100 text-yellow-600";
    default:
      return "border-gray-300 bg-gray-100 text-gray-500";
  }
}

setup();

async function setup() {
  isLoading.value = true;
  await coursePackStore.setupCoursePack(coursePackId);
  if (isAuthenticated()) {
    try {
      ratings.value = await fetchCourseRatings(coursePackId);
    } catch (e) {
      console.error("fetch ratings failed", e);
    }
  }
  isLoading.value = false;
}

function handleChangeCourse(courseId: string) {
  updateActiveCourseMap(coursePackId, courseId);
  navigateTo(`/game/${coursePackId}/${courseId}`);
}
</script>

<style></style>
