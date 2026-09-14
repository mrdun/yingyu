<template>
  <!--
    区块 4 左: 连续打卡 (大号天数 + 周历 7 格 + 底部 3 项统计)。

    数据与交互全部沿用改造前的 CheckInCard:
      · 打卡 = 父级 (components/Home/index.vue) 调 checkInTask("daily_check_in"), 这里只发事件;
      · 打卡日历 / 炫耀战绩 两个入口保留;
      · 周历语义按 DESIGN.md: 已完成=浅蓝底+✓ · 今天=蓝底实心 · 未来=虚线空框。
    视觉改成工作台配色 (wb-*), 不再是紫/橙渐变卡。
  -->
  <section class="ci">
    <div class="ci__head">
      <div>
        <p class="ci__streak">{{ formatCount(props.streak) }}<span>天</span></p>
        <p class="ci__title">连续打卡</p>
        <p class="ci__sub">{{ subtitle }}</p>
      </div>

      <div class="ci__action">
        <button
          type="button"
          class="ci__btn"
          :disabled="props.loading || props.busy || props.checkedIn"
          @click="emit('check-in')"
        >
          <span v-if="props.loading">加载中...</span>
          <span v-else-if="props.busy">打卡中...</span>
          <span v-else-if="props.checkedIn">✓ 已打卡</span>
          <span v-else>立即打卡</span>
        </button>
        <p class="ci__hint">打卡 🪙 +5 · 连续 3 天 +20 · 连续 7 天 +50</p>
      </div>
    </div>

    <!-- 本周打卡格子: 三态 (已完成 / 今天 / 未来) + 历史未打卡的中性格 -->
    <div class="ci__week">
      <div
        v-for="day in weekDays"
        :key="day.date"
        class="ci__day"
      >
        <span class="ci__day-label">{{ day.label }}</span>
        <span
          class="ci__day-box"
          :class="day.cellClass"
        >
          {{ day.cellText }}
        </span>
      </div>
    </div>

    <div class="ci__stats">
      <div>
        <p class="ci__stat-v">{{ formatCount(props.cumulativeDays) }}</p>
        <p class="ci__stat-k">累计打卡</p>
      </div>
      <div>
        <p class="ci__stat-v">{{ formatDuration(props.totalLearnSeconds) }}</p>
        <p class="ci__stat-k">累计学习</p>
      </div>
      <div>
        <p class="ci__stat-v">{{ formatCount(props.masteredCount) }}</p>
        <p class="ci__stat-k">掌握句子</p>
      </div>
    </div>

    <p
      v-if="props.message || localMessage"
      class="ci__msg"
    >
      {{ props.message || localMessage }}
    </p>

    <div class="ci__links">
      <button
        type="button"
        class="ci__link"
        @click="showCalendar = !showCalendar"
      >
        📅 {{ showCalendar ? "收起日历" : "打卡日历" }}
      </button>
      <button
        type="button"
        class="ci__link"
        @click="shareAchievement"
      >
        🎯 炫耀战绩
      </button>
    </div>

    <!-- 打卡日历 (折叠): 历史月度视图, 复用原组件, 只换配色 -->
    <CheckInCalendar
      v-if="showCalendar"
      class="mt-3"
      :checked-in-dates="props.checkedInDates"
    />
  </section>
</template>

<script setup lang="ts">
import dayjs from "dayjs";
import { computed, ref } from "vue";

import CheckInCalendar from "~/components/CheckInCalendar.vue";
import {
  formatCount,
  formatDuration,
  resolveWeekDayState,
  WEEK_DAY_LABELS,
} from "~/utils/memberCenter";

const props = defineProps<{
  /** fetchStatsOverview().reviewStreak */
  streak: number;
  /** fetchStatsOverview().totalLearnDays */
  cumulativeDays: number;
  /** fetchStatsOverview().masteredCount */
  masteredCount: number;
  /** fetchStatsOverview().totalLearnDurationSeconds → 格式化成「x 小时 y 分」 */
  totalLearnSeconds: number;
  /** fetchCheckInHistory().dates */
  checkedInDates: string[];
  /** fetchTodayTasks() 里 daily_check_in 的 claimed */
  checkedIn: boolean;
  loading: boolean;
  busy: boolean;
  message: string;
}>();

const emit = defineEmits<{
  (event: "check-in"): void;
}>();

const showCalendar = ref(false);
const localMessage = ref("");

const subtitle = computed(() => {
  if (props.checkedIn) return "今天已经打过卡了，明天见 👋";
  if (props.streak > 0) return `已经连续 ${formatCount(props.streak)} 天，今天别忘了打卡`;

  return "今天还没有打卡，从第一句开始吧";
});

/**
 * 本周 (ISO, 周一起) 的 7 个格子。
 *
 * 两处容易踩的坑:
 *   1. dayjs 的 `.day(1)` 在周日会取到"明天", 会让今天从周历里消失 —— 所以按 ISO 手工算偏移;
 *   2. 「今天」必须用 **UTC 日期字符串**, 与后端 toDateStr (apps/api/src/coins/coins.rules.ts) 一致:
 *      打卡历史 / 每日任务 / 学习时长全部按 UTC 记账, 混用本地日期会在 UTC 边界
 *      (如 UTC+8 的 00:00–08:00) 把 ✓ 画到相邻的那一格。
 */
const weekDays = computed(() => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const today = dayjs(todayStr);
  const dayOfWeek = today.day(); // 0=周日
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = today.add(mondayOffset, "day");

  return Array.from({ length: 7 }, (_, index) => {
    const date = monday.add(index, "day").format("YYYY-MM-DD");
    const state = resolveWeekDayState(date, todayStr, props.checkedInDates);
    const isToday = date === todayStr;

    return {
      date,
      label: WEEK_DAY_LABELS[index],
      cellClass: isToday
        ? "ci__day-box--today"
        : state === "done"
          ? "ci__day-box--done"
          : state === "future"
            ? "ci__day-box--future"
            : "",
      // 已完成优先显示 ✓; 今天 (还没打卡) 显示"今"; 未来/中性是空框
      cellText: state === "done" ? "✓" : isToday ? "今" : "",
    };
  });
});

function shareAchievement() {
  // 与原实现一致: 炫耀战绩是占位功能
  localMessage.value = "✨ 炫耀战绩功能即将上线！";
}
</script>

<style scoped>
/* 打卡卡: 目标站用「白卡 vs 浅蓝面板」分层, 所以这张卡做成白底 + 极浅蓝渐变 */
.ci {
  display: flex;
  flex-direction: column;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: linear-gradient(135deg, #ffffff 55%, #f1f6ff 100%);
  padding: 15px 17px;
}

.ci__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.ci__streak {
  font-size: 36px;
  font-weight: 900;
  line-height: 1;
  color: #2a64e7;
}

.ci__streak span {
  margin-left: 3px;
  font-size: 13px;
  font-weight: 700;
  color: #666666;
}

.ci__title {
  margin-top: 6px;
  font-size: 14px;
  font-weight: 900;
  color: #1e293b;
}

.ci__sub {
  margin-top: 2px;
  font-size: 11.5px;
  font-weight: 600;
  color: #666666;
}

.ci__action {
  text-align: right;
  flex-shrink: 0;
}

.ci__btn {
  border: none;
  border-radius: 8px;
  background: #2c5af4;
  color: #fff;
  padding: 9px 16px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.ci__btn:hover:not(:disabled) {
  background: #2a64e7;
}

.ci__btn:disabled {
  background: #c7d4f7;
  cursor: not-allowed;
}

.ci__hint {
  margin-top: 5px;
  font-size: 10.5px;
  font-weight: 600;
  color: #666666;
}

.ci__week {
  display: flex;
  gap: 7px;
  margin-bottom: 14px;
}

.ci__day {
  flex: 1;
  text-align: center;
}

.ci__day-label {
  display: block;
  margin-bottom: 5px;
  font-size: 10.5px;
  font-weight: 700;
  color: #666666;
}

.ci__day-box {
  display: grid;
  place-items: center;
  height: 32px;
  border: 1px solid #e9eef6;
  border-radius: 9px;
  background: #f4f6fa;
  font-size: 13px;
  font-weight: 700;
  color: #666666;
}

/* 已完成: 浅蓝底 + 蓝字 + ✓ */
.ci__day-box--done {
  border-color: #d6e4ff;
  background: #eff6ff;
  color: #2c5af4;
}

/* 今天: 蓝底实心 (还没打卡时显示"今") */
.ci__day-box--today {
  border-color: transparent;
  background: #2c5af4;
  color: #fff;
  box-shadow: 0 4px 10px -4px rgba(44, 90, 244, 0.75);
}

/* 未来: 虚线空框 (不是几乎看不见的小圆点) */
.ci__day-box--future {
  border-style: dashed;
  border-color: #d8dfe9;
  background: transparent;
}

.ci__stats {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  padding-top: 12px;
  border-top: 1px dashed #e5e7eb;
}

.ci__stat-v {
  font-size: 17px;
  font-weight: 900;
  color: #1e293b;
}

.ci__stat-k {
  margin-top: 2px;
  font-size: 10.5px;
  font-weight: 600;
  color: #666666;
}

.ci__msg {
  margin-top: 10px;
  font-size: 12px;
  font-weight: 700;
  color: #2a64e7;
}

.ci__links {
  display: flex;
  gap: 16px;
  margin-top: 12px;
}

.ci__link {
  border: none;
  background: none;
  padding: 0;
  font-size: 11.5px;
  font-weight: 800;
  color: #2c5af4;
  cursor: pointer;
}

.ci__link:hover {
  text-decoration: underline;
}
</style>
