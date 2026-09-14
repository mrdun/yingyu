<template>
  <!-- 区块 6 右半: 最近 7 天练习句数柱状图 (空态也保持 7 根可见的底槽) -->
  <div class="week">
    <div class="week__bars">
      <div
        v-for="item in normalized"
        :key="item.date"
        class="week__col"
        :title="`${item.date} 练习 ${item.statements} 句`"
      >
        <div class="week__track">
          <i :style="{ height: `${item.percent}%` }"></i>
        </div>
        <span class="week__day">{{ item.label }}</span>
      </div>
    </div>
    <p class="week__caption">
      每天练习的句子数 · 近 7 天共
      <b>{{ formatCount(totalStatements) }}</b>
      句
    </p>
  </div>
</template>

<script setup lang="ts">
import dayjs from "dayjs";
import { computed } from "vue";

import type { DailyStat } from "~/api/stats";
import { barPercent, formatCount, safeNumber } from "~/utils/memberCenter";

const props = defineProps<{
  /** fetchStatsDaily(7): 后端保证返回 7 条, 缺数据的天已补 0 */
  data: DailyStat[];
}>();

const WEEK_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/**
 * 峰值用 reduce 从 0 起算 —— 空数组时 Math.max(...[]) 会得到 -Infinity,
 * 那会让每根柱子的高度算成非法百分比 (百分比文案由 utils/memberCenter.ts 兜底成 0%)。
 */
const peak = computed(() =>
  props.data.reduce((max, item) => Math.max(max, safeNumber(item.statements)), 0),
);

const totalStatements = computed(() =>
  props.data.reduce((sum, item) => sum + safeNumber(item.statements), 0),
);

const normalized = computed(() =>
  props.data.map((item) => ({
    date: item.date,
    statements: safeNumber(item.statements),
    percent: barPercent(item.statements, peak.value),
    label: WEEK_LABELS[dayjs(item.date).day()] ?? "",
  })),
);
</script>

<style scoped>
.week__bars {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 92px;
}

.week__col {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

/* 底槽始终可见: 全 0 数据时是 7 根浅灰柱, 而不是一片空白 */
.week__track {
  display: flex;
  align-items: flex-end;
  width: 100%;
  flex: 1;
  border-radius: 6px;
  background: #f1f4f8;
  overflow: hidden;
}

.week__track i {
  display: block;
  width: 100%;
  border-radius: 6px;
  background: #a9d2ff;
}

.week__col:last-child .week__track i {
  /* 今天用主色实心 (wb-accent), 其余天用浅蓝 */
  background: #2c5af4;
}

.week__day {
  font-size: 10.5px;
  font-weight: 700;
  color: #666666;
  white-space: nowrap;
}

.week__caption {
  margin-top: 8px;
  font-size: 11px;
  font-weight: 600;
  color: #666666;
}

.week__caption b {
  color: #1e293b;
  font-weight: 900;
}
</style>
