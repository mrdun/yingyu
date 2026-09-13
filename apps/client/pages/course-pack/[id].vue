<template>
  <div class="flex w-full flex-col">
    <template v-if="isLoading">
      <Loading></Loading>
    </template>

    <template v-else>
      <h2 class="mb-4 text-center text-3xl dark:border-gray-600">
        {{ coursePackStore.currentCoursePack?.title }}
      </h2>

      <!-- 学习进度 + 继续学习 -->
      <div
        v-if="isAuthenticated && coursePackStore.currentProgress"
        class="mb-6 flex flex-col items-center gap-3"
      >
        <div class="flex w-full max-w-md items-center gap-3">
          <progress
            class="progress progress-primary w-full"
            :value="coursePackStore.currentProgress.progress"
            max="100"
          ></progress>
          <span class="whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">
            {{ coursePackStore.currentProgress.completedCourses }} /
            {{ coursePackStore.currentProgress.totalCourses }} 课 （{{
              coursePackStore.currentProgress.progress
            }}%）
          </span>
        </div>
        <button
          v-if="canContinueLearning"
          class="rounded-full bg-brand-600 px-6 py-2 text-sm font-medium text-white shadow hover:bg-brand-500"
          @click="continueLearning"
        >
          继续学习
        </button>
      </div>

      <!-- 会员课程无权限: 展示 CTA -->
      <div
        v-if="
          coursePackStore.currentCoursePack?.requiresMembership && membershipCta.action !== 'none'
        "
        class="flex flex-col items-center gap-4 py-12"
      >
        <p class="text-lg text-zinc-600 dark:text-zinc-300">这是会员专享课程</p>
        <button
          class="rounded-full bg-brand-600 px-8 py-3 text-base font-semibold text-white shadow hover:bg-brand-500"
          @click="handleMembershipCta()"
        >
          {{ membershipCta.label }}
        </button>
      </div>

      <div class="h-full scrollbar-hide">
        <div
          v-if="!coursePackStore.currentCoursePack?.requiresMembership"
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
import { fetchMembershipStatus } from "~/api/membership";
import { useActiveCourseMap } from "~/composables/courses/activeCourse";
import { isAuthenticated, signIn } from "~/services/auth";
import { useCoursePackStore } from "~/store/coursePack";
import type { MembershipIdentity } from "~/utils/coursePackEntry";
import { resolveMembershipCta } from "~/utils/coursePackEntry";

const isLoading = ref(false);
const route = useRoute();
const coursePackStore = useCoursePackStore();
const coursePackId = route.params.id as string;
const { updateActiveCourseMap } = useActiveCourseMap();

/** 会员身份: 决定「会员专享」CTA 的文案与动作 (游客 → 登录, 非会员 → 会员页, 会员 → 无 CTA) */
const membershipIdentity = ref<MembershipIdentity>("non-member");
const membershipCta = computed(() => resolveMembershipCta(membershipIdentity.value));

const ratings = ref<Awaited<ReturnType<typeof fetchCourseRatings>>>([]);
const ratingMap = computed(() => {
  const map: Record<string, { grade: string; scoreRate: number }> = {};
  ratings.value.forEach((r) => {
    map[r.courseId] = { grade: r.grade, scoreRate: r.scoreRate };
  });
  return map;
});

const canContinueLearning = computed(() => {
  const progress = coursePackStore.currentProgress;
  return Boolean(progress && progress.lastCourseId && progress.progress < 100);
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
  await loadMembershipIdentity();
  if (isAuthenticated()) {
    await coursePackStore.setupCoursePackProgress(coursePackId);
    try {
      ratings.value = await fetchCourseRatings(coursePackId);
    } catch (e) {
      console.error("fetch ratings failed", e);
    }
  }
  isLoading.value = false;
}

async function loadMembershipIdentity() {
  if (!isAuthenticated()) {
    membershipIdentity.value = "guest";
    return;
  }
  try {
    const status = await fetchMembershipStatus();
    membershipIdentity.value = status.isMember ? "member" : "non-member";
  } catch (e: any) {
    const code = e?.status ?? e?.statusCode;
    membershipIdentity.value = code === 401 ? "guest" : "non-member";
  }
}

function handleMembershipCta() {
  if (membershipCta.value.action === "sign-in") {
    // 登录后回到当前课程包详情页 (而不是被丢回课程商城)
    signIn(route.path);
    return;
  }
  if (membershipCta.value.action === "membership") {
    navigateTo("/membership");
  }
}

function handleChangeCourse(courseId: string) {
  updateActiveCourseMap(coursePackId, courseId);
  navigateTo(`/game/${coursePackId}/${courseId}`);
}

function continueLearning() {
  const progress = coursePackStore.currentProgress;
  if (progress?.lastCourseId) {
    handleChangeCourse(progress.lastCourseId);
  }
}
</script>

<style></style>
