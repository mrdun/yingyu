import { reactive, ref } from "vue";

/**
 * 一次性答对统计:
 * - 每题首次作答正确才计入 correct
 * - 答错过 / 用了提示的题不计入正确
 * - 模块级单例状态
 */
const correctStatementIndexes = reactive(new Set<number>());
const failedStatementIndexes = reactive(new Set<number>());
const hintedStatementIndexes = reactive(new Set<number>());
const firstTryCorrectCount = ref(0);

export function useRatingTracker() {
  function recordCorrect(statementIndex: number) {
    if (failedStatementIndexes.has(statementIndex) || hintedStatementIndexes.has(statementIndex)) {
      return;
    }
    // recordCorrect 可能对同一题重复触发(如自动下一题前多次回调), 用 Set 去重
    if (correctStatementIndexes.has(statementIndex)) {
      return;
    }
    correctStatementIndexes.add(statementIndex);
    firstTryCorrectCount.value++;
  }

  function recordWrong(statementIndex: number) {
    failedStatementIndexes.add(statementIndex);
  }

  function recordHint(statementIndex: number) {
    hintedStatementIndexes.add(statementIndex);
  }

  function resetRating() {
    failedStatementIndexes.clear();
    hintedStatementIndexes.clear();
    correctStatementIndexes.clear();
    firstTryCorrectCount.value = 0;
  }

  function getFirstTryCorrect() {
    return firstTryCorrectCount.value;
  }

  return {
    firstTryCorrectCount,
    recordCorrect,
    recordWrong,
    recordHint,
    resetRating,
    getFirstTryCorrect,
  };
}
