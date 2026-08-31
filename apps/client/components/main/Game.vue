<template>
  <template v-if="isDictationMode()">
    <ModeDictationMode />
  </template>
  <template v-else-if="isChineseToEnglishMode()">
    <ModeChineseToEnglishMode />
  </template>

  <MainComboDisplay />
  <MainLearningTimer v-if="isAuthenticated()"></MainLearningTimer>
  <MainTips />
  <MainSummary />
  <MainShare />
  <GamePauseModal v-if="isAuthenticated()"></GamePauseModal>
  <MainGameSettingModal />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";

import ComboDisplay from "~/components/main/ComboDisplay.vue";
import GamePauseModal from "~/components/main/GamePauseModal.vue";
import { courseTimer } from "~/composables/courses/courseTimer";
import { useComboTracker } from "~/composables/main/comboTracker";
import { useGamePlayMode } from "~/composables/user/gamePlayMode";
import { isAuthenticated } from "~/services/auth";
import { useGameStore } from "~/store/game";

const { isChineseToEnglishMode, isDictationMode } = useGamePlayMode();
const gameStore = useGameStore();
const { resetCombo } = useComboTracker();

onMounted(() => {
  courseTimer.reset();
  gameStore.startGame();
});

onUnmounted(() => {
  gameStore.exitGame();
  resetCombo(); // 课结束时重置连击
});
</script>
