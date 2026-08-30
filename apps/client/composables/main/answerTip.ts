import { ref } from "vue";

import { useRatingTracker } from "~/composables/main/ratingTracker";
import { useCourseStore } from "~/store/course";

const answerTip = ref(false);

export function useAnswerTip() {
  function showAnswerTip() {
    answerTip.value = true;
    markHintUsed();
  }
  function hiddenAnswerTip() {
    answerTip.value = false;
  }

  function toggleAnswerTip() {
    answerTip.value = !answerTip.value;
    // 打开提示面板视为使用提示, 该题不再计入一次性答对
    if (answerTip.value) {
      markHint();
    }
  }

  const isAnswerTip = () => answerTip.value;

  return {
    answerTip,
    showAnswerTip,
    hiddenAnswerTip,
    isAnswerTip,
    toggleAnswerTip,
  };
}

function markHint() {
  try {
    const courseStore = useCourseStore();
    useRatingTracker().recordHint(courseStore.statementIndex);
  } catch {
    // pinia 未初始化时(单测)忽略
  }
}

function markHintUsed() {
  markHint();
}
