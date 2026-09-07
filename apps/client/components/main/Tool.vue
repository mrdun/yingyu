<template>
  <div
    class="relative flex items-center justify-between border-b border-solid border-zinc-200 px-6 py-4 text-base dark:border-zinc-700"
  >
    <!-- 左侧 -->
    <div class="flex items-center">
      <NuxtLink
        class="clickable-item flex items-center justify-center"
        :href="`/course-pack/${courseStore.currentCourse?.coursePackId}`"
      >
        <UTooltip text="课程列表">
          <IconsExpand class="h-7 w-7" />
        </UTooltip>
      </NuxtLink>
      <div
        class="clickable-item ml-4"
        @click="openCourseContents"
      >
        <UTooltip text="课程题目列表">
          {{ currentCourseInfo }}
        </UTooltip>
      </div>
      <MainStudyVideoLink :video="courseStore.currentCourse?.video" />
    </div>

    <!-- 右侧 -->
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2">
        <span class="text-sm dark:text-gray-200">听写模式</span>
        <input
          type="checkbox"
          class="toggle toggle-secondary toggle-sm"
          :checked="isDictationMode()"
          aria-label="听写模式"
          @change="toggleDictationMode"
        />
      </div>

      <template v-if="isDictationMode()">
        <div @click="toggleSentenceSound">
          <UTooltip :text="isPlaying ? '暂停发音' : '播放发音'">
            <UIcon
              :name="isPlaying ? 'i-ph-pause-circle' : 'i-ph-play-circle'"
              class="clickable-item h-6 w-6"
            />
          </UTooltip>
        </div>

        <div @click="handleToggleSlowRate">
          <UTooltip :text="isSlowRate() ? '恢复正常语速' : '慢速播放'">
            <UIcon
              name="i-ph-turtle"
              class="clickable-item h-6 w-6"
              :class="{ 'text-brand-600': isSlowRate() }"
            />
          </UTooltip>
        </div>

        <div @click="openGameSettingModal">
          <UTooltip text="游戏设置（重复次数/播放间隔/倍速）">
            <UIcon
              name="i-ph-gear"
              class="clickable-item h-6 w-6"
            />
          </UTooltip>
        </div>
      </template>

      <div
        v-if="isAuthenticated()"
        @click="pauseGame"
      >
        <UTooltip
          text="暂停游戏"
          :shortcuts="parseShortcut(shortcutKeys.pause)"
        >
          <UIcon
            name="i-ph-pause"
            class="clickable-item h-6 w-6"
          />
        </UTooltip>
      </div>

      <div @click="handleDoAgain">
        <UTooltip text="重置当前课程进度">
          <UIcon
            name="i-ph-arrow-counter-clockwise"
            class="clickable-item h-6 w-6"
          />
        </UTooltip>
      </div>
      <div @click="rankingStore.showRankModal">
        <UTooltip text="排行榜">
          <UIcon
            name="i-ph-ranking"
            class="clickable-item h-6 w-6"
          />
        </UTooltip>
      </div>
    </div>

    <MainCourseContents v-model:isOpen="isOpenCourseContents"></MainCourseContents>
  </div>

  <CommonProgressBar
    class="mt-2"
    :percentage="currentPercentage"
  />
  <RankRankingBoard />
</template>

<script setup lang="ts">
import { useModal } from "#imports";
import { computed, onMounted, ref } from "vue";

import Dialog from "~/components/common/Dialog.vue";
import { useQuestionInput } from "~/components/main/QuestionInput/questionInputHelper";
import { courseTimer } from "~/composables/courses/courseTimer";
import { useToolbar } from "~/composables/main/dictation";
import { SLOW_RATE, usePlaySentenceSound } from "~/composables/main/englishSound/sentence";
import { useGameMode } from "~/composables/main/game";
import { clearQuestionInput } from "~/composables/main/question";
import { useCourseContents } from "~/composables/main/useCourseContents";
import { useGamePause } from "~/composables/main/useGamePause";
import { useGameSetting } from "~/composables/main/useGameSetting";
import { useRanking } from "~/composables/rank/rankingList";
import { GamePlayMode, useGamePlayMode } from "~/composables/user/gamePlayMode";
import { parseShortcut, useShortcutKeyMode } from "~/composables/user/shortcutKey";
import { isAuthenticated } from "~/services/auth";
import { useCourseStore } from "~/store/course";

const { shortcutKeys } = useShortcutKeyMode();
const { isDictationMode, toggleGamePlayMode } = useGamePlayMode();
const { toolBarData, recoverToolBarData } = useToolbar();
const { isPlaying, pauseSentenceSound, toggleSentenceSound, toggleSlowRate } =
  usePlaySentenceSound();

// 进入游戏页时恢复持久化的工具栏设置（含慢速倍率）
onMounted(() => {
  recoverToolBarData();
});

const rankingStore = useRanking();
const courseStore = useCourseStore();
const { focusInput } = useQuestionInput();
const { openCourseContents } = useCourseContents();
const { handleDoAgain } = useDoAgain();
const { pauseGame } = useGamePause();
const { openGameSettingModal } = useGameSetting();
const modal = useModal();

const currentCourseInfo = computed(() => {
  return `${courseStore.currentCourse?.title}（${currentSchedule.value}/${courseStore.visibleStatementsCount}）`;
});

const currentSchedule = computed(() => {
  return courseStore.visibleStatementIndex + 1;
});

const currentPercentage = computed(() => {
  if (courseStore.isAllDone()) {
    return 100;
  }
  return ((courseStore.visibleStatementIndex / courseStore.visibleStatementsCount) * 100).toFixed(
    2,
  );
});

const isOpenCourseContents = ref(false);

// 听写模式开关：持久化在 localStorage（gamePlayMode），默认中译英（关）
function toggleDictationMode() {
  // 切换模式前停掉当前发音，避免切换后继续播放
  pauseSentenceSound();
  toggleGamePlayMode(isDictationMode() ? GamePlayMode.ChineseToEnglish : GamePlayMode.Dictation);
}

function isSlowRate() {
  return Number(toolBarData.rate) === SLOW_RATE;
}

function handleToggleSlowRate() {
  toggleSlowRate();
}

function useDoAgain() {
  const { showQuestion } = useGameMode();

  function handleDoAgain() {
    modal.open(Dialog, {
      title: "重置进度",
      content: "是否确认重置当前课程进度？",
      showCancel: true,
      showConfirm: true,
      async onCancel() {
        setTimeout(() => {
          focusInput();
        }, 300);
      },
      async onConfirm() {
        handleTipConfirm();
      },
    });
  }

  function handleTipConfirm() {
    courseStore.doAgain();
    clearQuestionInput();
    showQuestion();
    courseTimer.reset();
    // dialog 关闭后 自动聚焦 因为关闭有个 200 毫秒的动画 所以需要延迟聚焦 input
    setTimeout(() => {
      focusInput();
    }, 300);
  }

  return {
    handleDoAgain,
    handleTipConfirm,
  };
}
</script>

<style scoped>
.clickable-item {
  @apply cursor-pointer select-none hover:text-brand-600;
}
</style>
