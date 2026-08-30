import { courseTimer } from "~/composables/courses/courseTimer";
import { useGameMode } from "~/composables/main/game";
import { useInput } from "~/composables/main/question";
import { useRatingTracker } from "~/composables/main/ratingTracker";
import { useSummary } from "~/composables/main/summary";
import { useAutoNextQuestion } from "~/composables/user/autoNext";
import { useKeyboardSound } from "~/composables/user/sound";
import { useSpaceSubmitAnswer } from "~/composables/user/submitKey";
import { useCourseStore } from "~/store/course";
import { useQuestionInput } from "./questionInputHelper";
import { useAnswerError } from "./useAnswerError";
import { usePlayTipSound, useTypingSound } from "./useTypingSound";

export function useWrapperQuestionInput() {
  const courseStore = useCourseStore();
  const { showAnswer } = useGameMode();
  const { showSummary } = useSummary();
  const { setInputCursorPosition, getInputCursorPosition, blurInput, focusInput } =
    useQuestionInput();
  const { isKeyboardSoundEnabled } = useKeyboardSound();
  const { checkPlayTypingSound, playTypingSound } = useTypingSound();
  const { handleAnswerError } = useAnswerError();
  const { playRightSound } = usePlayTipSound();
  const { isAutoNextQuestion } = useAutoNextQuestion();
  const { isUseSpaceSubmitAnswer } = useSpaceSubmitAnswer();
  const { recordCorrect, recordWrong } = useRatingTracker();

  // 答错时记录该题 (用于评级: 答错过的题不计入一次性答对)
  function handleAnswerWrong() {
    recordWrong(courseStore.statementIndex);
    handleAnswerError();
  }

  const {
    initialize: initializeQuestionInput,
    findWordById,
    inputValue,
    submitAnswer,
    setInputValue,
    handleKeyboardInput,
    isFixMode,
    isFixInputMode,
  } = useInput({
    source: () => courseStore.currentStatement?.english!,
    setInputCursorPosition,
    getInputCursorPosition,
    inputChangedCallback,
  });

  function inputChangedCallback(e: KeyboardEvent) {
    if (isKeyboardSoundEnabled() && checkPlayTypingSound(e)) {
      playTypingSound();
    }
  }

  function handleAnswerRight() {
    courseTimer.timeEnd(String(courseStore.statementIndex)); // 停止当前题目的计时
    playRightSound();
    // 统计一次性答对 (若本题答错过或用过提示则不计入)
    recordCorrect(courseStore.statementIndex);

    if (isAutoNextQuestion()) {
      // 自动下一题
      if (courseStore.isAllDone()) {
        blurInput(); // 失去输入焦点，防止结束时光标仍然在输入框，造成后续结算面板回车事件无法触发
        showSummary();
      }
      courseStore.toNextStatement();
    } else {
      showAnswer();
    }
  }

  return {
    initializeQuestionInput,
    isFixMode,
    isFixInputMode,
    findWordById,
    inputValue,
    setInputValue,
    submitAnswer() {
      submitAnswer(handleAnswerRight, handleAnswerWrong);
      focusInput();
    },
    handleKeyboardInput(e: KeyboardEvent) {
      handleKeyboardInput(e, {
        useSpaceSubmitAnswer: {
          enable: isUseSpaceSubmitAnswer(),
          rightCallback: handleAnswerRight,
          errorCallback: handleAnswerWrong,
        },
      });
    },
  };
}
