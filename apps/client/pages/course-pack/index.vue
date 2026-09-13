<template>
  <div class="flex w-full flex-col">
    <h2
      class="mb-6 text-center text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white"
    >
      课程广场
    </h2>

    <!-- 首次进入引导: 说明如何开始 + 会员状态 (不含复杂引导流程) -->
    <div
      class="mb-6 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="text-gray-600 dark:text-gray-300">
          <span class="font-medium">第一次来?</span>
          免费课程可直接学习, 带「会员」标记的课程需要开通会员。
        </div>
        <div class="flex items-center gap-2">
          <span
            v-if="membershipState === 'member'"
            class="badge badge-success badge-sm"
          >
            会员已生效
          </span>
          <button
            v-if="membershipState !== 'member'"
            class="btn btn-xs"
            :class="membershipState === 'guest' ? '' : 'border-none bg-purple-500 text-white'"
            @click="handleMembershipCta()"
          >
            {{ membershipState === "guest" ? "登录" : "查看会员方案" }}
          </button>
        </div>
      </div>
    </div>

    <!-- 搜索 + 筛选 -->
    <div class="mb-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
      <input
        v-model="keyword"
        type="text"
        placeholder="搜索课程包..."
        class="input input-sm input-bordered w-full max-w-xs rounded-full border-zinc-200 bg-white"
      />
      <div class="flex items-center gap-2">
        <button
          v-for="opt in filterOptions"
          :key="opt.value"
          class="rounded-full px-5 py-1.5 text-xs font-medium tracking-wide transition-all duration-200"
          :class="
            filter === opt.value
              ? 'bg-brand-600 text-white shadow-lg shadow-blue-200/60'
              : 'border border-zinc-200 bg-white text-zinc-600 hover:border-brand-300 hover:text-brand-600'
          "
          @click="setFilter(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <template v-if="isLoading">
      <Loading></Loading>
    </template>
    <template v-else>
      <div class="h-[79vh] overflow-y-auto overflow-x-hidden scrollbar-hide">
        <div
          class="grid auto-rows-fr grid-cols-1 gap-4 px-4 sm:grid-cols-2 sm:px-0 md:grid-cols-3 lg:grid-cols-4"
        >
          <template v-for="coursePack in coursePackStore.coursePacks">
            <CoursePackCard
              :coursePack="coursePack"
              @cardClick="handleGoToCoursePack"
            ></CoursePackCard>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { navigateTo } from "#app";
import { onBeforeUnmount, ref, watch } from "vue";

import type { CoursePacksItem } from "~/types";
import { fetchCoursePack, fetchCoursePacks } from "~/api/course-pack";
import { fetchMembershipStatus } from "~/api/membership";
import CoursePackCard from "~/components/courses/CoursePackCard.vue";
import { signIn } from "~/services/auth";
import { useCoursePackStore } from "~/store/coursePack";
import { resolveCoursePackCardEntryPath } from "~/utils/coursePackEntry";

const coursePackStore = useCoursePackStore();
const isLoading = ref(false);

const keyword = ref("");
const filter = ref("all");
/** 首次进入引导用的会员状态: member / non-member / guest */
const membershipState = ref<"member" | "non-member" | "guest">("non-member");
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const filterOptions = [
  { label: "全部", value: "all" },
  { label: "免费", value: "free" },
  { label: "会员", value: "paid" },
];

setup();

loadMembershipState();

async function loadMembershipState() {
  try {
    const status = await fetchMembershipStatus();
    membershipState.value = status.isMember ? "member" : "non-member";
  } catch (e: any) {
    const code = e?.status ?? e?.statusCode;
    membershipState.value = code === 401 ? "guest" : "non-member";
  }
}

function handleMembershipCta() {
  if (membershipState.value === "guest") {
    signIn();
    return;
  }
  navigateTo("/membership");
}

async function setup() {
  // 课程包不会更新 所以初始化的时候只拉取一次数据就好了
  if (coursePackStore.coursePacks.length === 0) {
    isLoading.value = true;
    await coursePackStore.setupCoursePacks();
    isLoading.value = false;
  }
}

watch([keyword, filter], () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    applySearch();
  }, 300);
});

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});

function setFilter(value: string) {
  filter.value = value;
}

async function applySearch() {
  isLoading.value = true;
  try {
    coursePackStore.coursePacks = await fetchCoursePacks({
      keyword: keyword.value,
      filter: filter.value,
    });
  } finally {
    isLoading.value = false;
  }
}

async function handleGoToCoursePack(coursePack: CoursePacksItem) {
  // 「立即开始学习」必须真的立即开始: accessible === true (免费课 / 有权限的会员课)
  // 先取一次课程包, 直接进入第一课练习; 无权限 / 取数失败 / 包内无课程 → 课程包详情页。
  // 决策与兜底都在 utils/coursePackEntry.ts, 任何取值都不会把用户送去会员墙。
  const target = await resolveCoursePackCardEntryPath(
    (coursePackId) => fetchCoursePack(coursePackId),
    coursePack,
  );
  await navigateTo(target.path);
}
</script>

<style></style>
