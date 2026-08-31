import { computed, ref } from "vue";

/**
 * 连击激励系统 (完全对齐句乐部):
 * - 每题首次答对 → 连击+1
 * - 答错/用提示 → 连击归0
 * - 课结束 → 连击归0
 */
const comboCount = ref(0);

/**
 * 连击加成表 (完全对齐句乐部):
 * - 0-2连击: 1.0x (无加成)
 * - 3连击: 1.1x (+10%得分)
 * - 5连击: 1.2x (+20%得分)
 * - 10连击: 1.5x (+50%得分)
 * - 20连击: 2.0x (翻倍)
 */
const COMBO_MULTIPLIER_TABLE: Record<number, number> = {
  3: 1.1,
  5: 1.2,
  10: 1.5,
  20: 2.0,
};

export function useComboTracker() {
  const multiplier = computed(() => {
    // 找到当前连击数对应的最大倍率
    let currentMultiplier = 1.0;
    const sortedThresholds = Object.keys(COMBO_MULTIPLIER_TABLE)
      .map(Number)
      .sort((a, b) => a - b);

    for (const threshold of sortedThresholds) {
      if (comboCount.value >= threshold) {
        currentMultiplier = COMBO_MULTIPLIER_TABLE[threshold];
      }
    }
    return currentMultiplier;
  });

  function incrementCombo() {
    comboCount.value++;
  }

  function resetCombo() {
    comboCount.value = 0;
  }

  function getComboCount() {
    return comboCount.value;
  }

  function getMultiplier() {
    return multiplier.value;
  }

  function getMultiplierTable() {
    return { ...COMBO_MULTIPLIER_TABLE };
  }

  return {
    comboCount,
    multiplier,
    incrementCombo,
    resetCombo,
    getComboCount,
    getMultiplier,
    getMultiplierTable,
  };
}
