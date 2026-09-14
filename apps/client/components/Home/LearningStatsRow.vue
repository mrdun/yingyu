<template>
  <!-- 区块 3: 学习数据 4 列 (浅底 + 大数字 + 右下角水印图标) -->
  <div class="stats">
    <div class="stats__tile stats__tile--blue">
      <p class="stats__k">今日练习时长</p>
      <p class="stats__v">{{ formatCount(props.minutes) }}<small>分钟</small></p>
      <span class="stats__wm">⏱️</span>
    </div>

    <div class="stats__tile stats__tile--green">
      <p class="stats__k">今日练习</p>
      <p class="stats__v">{{ formatCount(props.statements) }}<small>句</small></p>
      <span class="stats__wm">📝</span>
    </div>

    <div class="stats__tile stats__tile--orange">
      <p class="stats__k">累计练习</p>
      <p class="stats__v">{{ formatCount(props.totalStatements) }}<small>句</small></p>
      <span class="stats__wm">👑</span>
    </div>

    <div class="stats__tile stats__tile--violet">
      <p class="stats__k">连续天数</p>
      <p class="stats__v">{{ formatCount(props.streak) }}<small>天</small></p>
      <span class="stats__wm">📅</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatCount } from "~/utils/memberCenter";

/**
 * 四个数字全部是「接口值 → safeNumber → formatCount」,
 * 空态 (全 0) 渲染 0 分钟 / 0 句 / 0 句 / 0 天, 不会出现非法数字或空白。
 *
 * ⚠️ 第三张是「累计练习」(StatsOverview.totalStatements, 累计练习句数) ——
 * 与目标站第三张卡口径一致。**不要**把它换回 masteredCount (累计掌握):
 * 「累计掌握」是掌握句子数 (掌握判定更严), 与「累计练习」不是同一个量, 换回去是两个数字互相顶替。
 * 掌握数仍在「千句进度」(SentenceGoalCard) 与成长报告里使用。
 */
const props = defineProps<{
  minutes: number;
  statements: number;
  totalStatements: number;
  streak: number;
}>();
</script>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

@media (max-width: 1024px) {
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .stats {
    grid-template-columns: 1fr;
  }
}

.stats__tile {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  padding: 13px 15px;
}

.stats__k {
  font-size: 11px;
  font-weight: 700;
  /* wb-muted (#666666, 5.74:1) —— 不用落地页那套浅灰蓝 */
  color: #666666;
}

.stats__v {
  margin-top: 5px;
  font-size: 24px;
  font-weight: 900;
  line-height: 1.1;
}

.stats__v small {
  margin-left: 3px;
  font-size: 12px;
  font-weight: 700;
  color: #666666;
}

.stats__wm {
  position: absolute;
  right: -6px;
  bottom: -8px;
  font-size: 46px;
  opacity: 0.13;
}

.stats__tile--blue {
  background: #eef4ff;
}
.stats__tile--blue .stats__v {
  color: #2c5af4;
}

.stats__tile--green {
  background: #eafbf1;
}
.stats__tile--green .stats__v {
  color: #0e9f6e;
}

.stats__tile--orange {
  background: #fff3e6;
}
.stats__tile--orange .stats__v {
  color: #d97706;
}

.stats__tile--violet {
  background: #f3eeff;
}
.stats__tile--violet .stats__v {
  color: #7c3aed;
}
</style>
