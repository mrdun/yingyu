<template>
  <!--
    memberCenter = 会员中心主页 (登录后 `/`) 的「我的课程」形态:
    4 列等宽栅格 + 最后一格虚线「+ 添加课程」。
    默认形态 (/my-courses 页) 的外观与栅格完全不变, 只是多了这个开关。
  -->
  <div :class="memberCenter ? 'flex min-h-[168px]' : 'flex min-h-[350px]'">
    <!-- Loading -->
    <div
      v-if="isLoading"
      class="flex flex-1 items-center justify-center"
    >
      <span class="loading loading-dots loading-md"></span>
    </div>
    <div
      v-else
      class="w-full"
    >
      <div
        v-if="coursePacks.length || memberCenter"
        :class="gridClass"
      >
        <template v-for="coursePack in coursePacks">
          <CoursePackCard
            :variant="memberCenter ? 'workbench' : 'default'"
            :coursePack="{
              id: coursePack.coursePackId,
              title: coursePack.title,
              description: coursePack.description,
              cover: coursePack.cover,
              isFree: coursePack.isFree,
            }"
            :progress="memberCenter ? progressByPackId[coursePack.coursePackId] : null"
            @cardClick="handleCardClick"
          >
            <!--
              这两个按钮只在 /my-courses 形态 (default) 用得上, 与改造前完全一致。
              工作台形态卡片不读 actions 槽: 它自己渲染设计稿里那一个整宽蓝按钮,
              点击再由卡片根节点冒泡回 @cardClick。
            -->
            <template #actions>
              <div class="mt-2 flex justify-between">
                <button
                  class="btn btn-sm tw-btn-blue"
                  @click.stop="gotoCourseList(coursePack.coursePackId)"
                >
                  课程列表
                </button>
                <button
                  class="btn btn-success btn-sm text-white"
                  @click.stop="gotoGame(coursePack.coursePackId, coursePack.courseId)"
                >
                  继续游戏
                </button>
              </div>
            </template>
          </CoursePackCard>
        </template>

        <!-- 最后一格: 虚线「+ 添加课程」→ 课程广场 -->
        <NuxtLink
          v-if="memberCenter"
          to="/course-pack"
          class="add-course"
          :class="{ 'lg:col-span-4': coursePacks.length === 0 }"
        >
          <span
            v-if="coursePacks.length === 0"
            class="add-course__hint"
          >
            还没有课程，先挑一门开始吧
          </span>
          + 添加课程
        </NuxtLink>
      </div>
      <template v-else>
        <div class="flex h-full w-full flex-1 items-center justify-center text-slate-500">
          暂无记录，<NuxtLink
            href="/course-pack"
            class="link text-blue-500 no-underline hover:opacity-75"
            >先学习一课， </NuxtLink
          >再来看看吧~
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { navigateTo } from "#app";
import { computed, ref } from "vue";

import type { CoursePackProgress } from "~/types";
import type { CoursePackCardModel } from "~/utils/coursePackEntry";
import { fetchCoursePackProgress } from "~/api/course-pack";
import CoursePackCard from "~/components/courses/CoursePackCard.vue";
import { useNavigation } from "~/composables/useNavigation";
import { useRecentCoursePack } from "./useRecentCoursePack";

const props = withDefaults(
  defineProps<{
    /** 会员中心主页的 4 列形态 (含最后一格「+ 添加课程」); 默认保持 /my-courses 的三列形态 */
    memberCenter?: boolean;
  }>(),
  { memberCenter: false },
);

const memberCenter = computed(() => props.memberCenter);

const gridClass = computed(() =>
  memberCenter.value
    ? "grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    : "grid w-full grid-cols-1 gap-4 min-[500px]:grid-cols-2 md:grid-cols-1 min-[850px]:grid-cols-2 xl:grid-cols-3",
);

const { gotoCourseList, gotoGame } = useNavigation();
const { coursePacks, fetchCoursePacks } = useRecentCoursePack();
const isLoading = ref(false);

/**
 * 工作台形态的第二行「第 N 课 · xx%」需要课程包进度, 而 recent-course-packs 接口只给
 * 「最近学的包」(没有百分比), 所以逐包取一次既有的 GET /course-pack/:id/progress。
 * 只有 memberCenter 形态才取; /my-courses 形态不为不显示的数据多打请求。
 */
const progressByPackId = ref<Record<string, CoursePackProgress | undefined>>({});

/** 工作台形态点卡片 = 旧版「继续游戏」按钮的落点: 直接回到这个包最近学的那一课 */
function handleCardClick(coursePack: CoursePackCardModel) {
  // /my-courses 形态保持原样: 整块点击不跳转, 去哪由两个按钮决定
  if (!memberCenter.value) return;

  const recent = coursePacks.value.find((item) => item.coursePackId === coursePack.id);
  if (recent?.courseId) return gotoGame(recent.coursePackId, recent.courseId);

  // 极端情况 (没有 courseId) → 退到课程包详情页, 不让用户点出白屏
  return gotoCourseList(coursePack.id);
}

async function loadProgress() {
  const next: Record<string, CoursePackProgress | undefined> = {};

  await Promise.all(
    coursePacks.value.map(async (coursePack) => {
      try {
        next[coursePack.coursePackId] = await fetchCoursePackProgress(coursePack.coursePackId);
      } catch {
        // 无权限 (会员课) / 取数失败 → 这张卡不显示进度 (退化成课程包描述), 不影响其它卡片
      }
    }),
  );

  progressByPackId.value = next;
}

setup();

async function setup() {
  if (coursePacks.value.length === 0) {
    isLoading.value = true;
    await fetchCoursePacks();
    isLoading.value = false;
  } else {
    await fetchCoursePacks();
  }

  if (memberCenter.value) await loadProgress();
}
</script>

<style scoped>
/* 最后一格: 虚线「+ 添加课程」 */
.add-course {
  display: grid;
  place-items: center;
  gap: 4px;
  min-height: 148px;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  background: #fff;
  font-size: 12px;
  font-weight: 800;
  color: #666666;
  text-decoration: none;
}

/* 一门课都没有时, 虚线格子横跨整行, 空态不会只剩一个孤零零的小方块 */
.add-course__hint {
  font-size: 12px;
  font-weight: 600;
  color: #666666;
}

.add-course:hover {
  border-color: #2c5af4;
  color: #2c5af4;
}
</style>
