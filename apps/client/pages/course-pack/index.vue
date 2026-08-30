<template>
  <div class="flex w-full flex-col">
    <h2 class="mb-4 text-center text-3xl dark:border-gray-600">课程包列表</h2>

    <!-- 搜索 + 筛选 -->
    <div class="mb-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <input
        v-model="keyword"
        type="text"
        placeholder="搜索课程包..."
        class="input input-sm input-bordered w-full max-w-xs"
      />
      <div class="join">
        <button
          v-for="opt in filterOptions"
          :key="opt.value"
          class="btn join-item btn-sm"
          :class="filter === opt.value ? 'btn-primary' : 'btn-ghost'"
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
              :coursePack="{
                id: coursePack.id,
                title: coursePack.title,
                description: coursePack.description,
                cover: coursePack.cover,
                isFree: coursePack.isFree,
              }"
              @cardClick="handleGoToCoursePack"
            ></CoursePackCard>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";

import type { CoursePack } from "~/types";
import { fetchCoursePacks } from "~/api/course-pack";
import CoursePackCard from "~/components/courses/CoursePackCard.vue";
import { useNavigation } from "~/composables/useNavigation";
import { useCoursePackStore } from "~/store/coursePack";

const coursePackStore = useCoursePackStore();
const { gotoCourseList } = useNavigation();
const isLoading = ref(false);

const keyword = ref("");
const filter = ref("all");
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const filterOptions = [
  { label: "全部", value: "all" },
  { label: "免费", value: "free" },
  { label: "会员", value: "paid" },
];

setup();

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

function handleGoToCoursePack(coursePack: CoursePack) {
  if (coursePack.isFree) {
    gotoCourseList(coursePack.id);
  } else {
    // 看看是不是会员 不是的话 直接弹出消息告知 需要是会员
    // TODO 还没有检测是不是会员的功能函数
    console.log("需要是会员");
  }
}
</script>

<style></style>
