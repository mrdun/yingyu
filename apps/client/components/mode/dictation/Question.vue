<template>
  <div>
    <MainQuestionInput />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";

import { usePlaySentenceSound } from "~/composables/main/englishSound/sentence";
import { useCourseStore } from "~/store/course";

// 听写模式：进入题目/切换下一句时自动播放整句发音
const { playSentenceSound, pauseSentenceSound } = usePlaySentenceSound();
const courseStore = useCourseStore();

onMounted(() => {
  playSentenceSound();

  watch(
    () => courseStore.statementIndex,
    () => {
      pauseSentenceSound();
      playSentenceSound();
    },
  );

  onUnmounted(() => {
    pauseSentenceSound();
  });
});
</script>
