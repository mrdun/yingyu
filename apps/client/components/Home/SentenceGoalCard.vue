<template>
  <!-- 区块 7: 千句进度 (目标值只来自 utils/memberCenter.ts 的 SENTENCE_GOAL) -->
  <section class="goal">
    <p class="goal__txt">
      用你的注意力填满
      <em>{{ formatCount(SENTENCE_GOAL) }} 个句子</em>，就能把日常英语真正用起来。
    </p>

    <div class="goal__right">
      <p class="goal__pct">{{ percentText }}</p>
      <div class="goal__bar">
        <i :style="{ width: progressWidth(props.mastered, SENTENCE_GOAL) }"></i>
      </div>
      <p class="goal__cap">
        {{ formatCount(props.mastered) }} / {{ formatCount(SENTENCE_GOAL) }} 句 已掌握
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { formatCount, formatPercent, progressWidth, SENTENCE_GOAL } from "~/utils/memberCenter";

const props = defineProps<{
  /** fetchStatsOverview().masteredCount */
  mastered: number;
}>();

/** 空态 → "0%" (不是 "undefined%" 之类的破版文案), 满 1000 句 → "100%" */
const percentText = computed(() => formatPercent(props.mastered, SENTENCE_GOAL));
</script>

<style scoped>
.goal {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  border: 1px solid #e0eafa;
  border-radius: 14px;
  background: linear-gradient(135deg, #f7faff, #eef4ff);
  padding: 16px 20px;
}

.goal__txt {
  flex: 1;
  min-width: 240px;
  font-size: 15px;
  font-weight: 900;
  line-height: 1.6;
  color: #1e293b;
}

.goal__txt em {
  font-style: normal;
  color: #2a64e7;
}

.goal__right {
  flex-shrink: 0;
  text-align: right;
}

.goal__pct {
  font-size: 30px;
  font-weight: 900;
  letter-spacing: -0.5px;
  color: #2c5af4;
}

.goal__bar {
  width: 190px;
  max-width: 100%;
  height: 7px;
  margin: 7px 0 5px;
  border-radius: 999px;
  background: #e2eaf7;
  overflow: hidden;
}

.goal__bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: #2c5af4;
}

.goal__cap {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: #666666;
}
</style>
