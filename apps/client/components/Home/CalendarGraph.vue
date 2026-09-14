<template>
  <div class="flex justify-between">
    <!-- 左侧打卡图 -->
    <div
      class="min-w-0 flex-1 rounded-[12px] border border-[#E5E7EB] px-3 py-4 text-xs text-[#666666]"
    >
      <div
        class="w-full overflow-x-auto"
        ref="tableContainer"
      >
        <table
          class="mx-auto mb-2"
          ref="calendarTable"
        >
          <thead>
            <th></th>
            <th
              v-for="{ colSpan, month } in thead"
              class="pb-1 text-left font-normal"
              :colspan="colSpan"
              :key="month"
            >
              {{ month }}
            </th>
          </thead>
          <tbody>
            <tr
              v-for="(row, i) in tbody"
              :key="weeksZh[i]"
            >
              <td class="relative hidden w-8 md:block">
                <span class="absolute">{{ i % 2 !== 0 ? weeksZh[i] : "" }}</span>
              </td>
              <td
                v-for="(cell, j) in row"
                :key="j"
              >
                <UTooltip :text="cell?.tips">
                  <div
                    class="cell block"
                    :class="[cell?.bg]"
                  ></div>
                </UTooltip>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-2 flex justify-between px-1">
        <span class="justify-self-end text-[12px] font-semibold">
          {{ totalLearningTime > 0 ? "一共学习" : "还没有开始学习" }}
          <span
            v-if="totalLearningTime > 0"
            class="font-extrabold text-[#2C5AF4]"
            >{{ formatLearningTime(totalLearningTime) }}</span
          >
        </span>
        <div class="flex items-center gap-1 text-xs">
          <div class="text-[#666666]">更少</div>
          <div class="cell"></div>
          <div class="cell low"></div>
          <div class="cell moderate"></div>
          <div class="cell high"></div>
          <div class="cell higher"></div>
          <div class="text-[#666666]">更多</div>
        </div>
      </div>
    </div>

    <!-- 右侧年份选项 -->
    <!-- TODO: 多年份选择还没做，目前只有 2024，先写死了 -->
    <div
      v-for="year in yearOptions"
      class="mc-year ml-6 hidden xl:flex"
      :key="year.value"
    >
      {{ year.label }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";

import type { CalendarDataItem, EmitsType } from "~/composables/user/calendarGraph";
import { useCalendarGraph } from "~/composables/user/calendarGraph";

enum ActivityLevel {
  Low = "low",
  Moderate = "moderate",
  High = "high",
  Higher = "higher",
}

const props = defineProps<{
  data: CalendarDataItem[];
  totalLearningTime: number;
}>();

const emits = defineEmits<EmitsType>();
const calendarTable = ref<HTMLTableElement>();
const tableContainer = ref<HTMLDivElement | null>(null);

const { initTable, renderBody, thead, tbody, weeksZh, yearOptions } = useCalendarGraph(emits, {
  getActivityLevel(item) {
    if (!item) return "";

    const duration = secondToMinutes(item.duration);
    if (duration < 10) return ActivityLevel.Low;
    if (duration < 30) return ActivityLevel.Moderate;
    if (duration < 60) return ActivityLevel.High;
    return ActivityLevel.Higher;
  },
  tipFormatter(current) {
    if (current.duration === 0) return `${current?.date} 没有学习`;

    let tip = "";
    const minutes = secondToMinutes(current.duration);
    if (minutes < 1) {
      tip = "不足 1 分钟";
    } else {
      tip = ` ${secondToMinutes(current.duration)} 分钟`;
    }
    return `${current.date} 学习${tip}`;
  },
});

function secondToMinutes(second: number) {
  return Math.floor(second / 60);
}

function formatLearningTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}小时${minutes}分钟`;
  } else {
    if (minutes === 0) {
      return `不足 1 分钟`;
    } else {
      return `${minutes}分钟`;
    }
  }
}

onMounted(() => {
  initTable();
  scrollAutoToRight();
});

function scrollAutoToRight() {
  nextTick(() => {
    if (tableContainer.value) {
      tableContainer.value.scrollLeft = tableContainer.value.scrollWidth;
    }
  });
}

// watch 只追踪 props.data 的引用变化; handler 里读写 tbody 不参与依赖收集,
// 从根上避免 watchEffect 读 tbody 又写 tbody 的自触发无限循环
watch(
  () => props.data,
  (data) => {
    const snapshot = data ? data.map((item) => ({ ...item })) : [];
    tbody.value = renderBody(snapshot);
  },
  { immediate: true },
);
</script>

<style scoped>
/* 热力图配色改用工作台蓝阶 (wb-accent 方向), 不再用 GitHub 绿 —— 与 wb-* 面板同色系 */
.cell {
  @apply h-[12px] w-[12px] rounded-sm hover:scale-125 hover:border;
  background: #f2f4f8;
  border-color: #eef2f7;
}

.cell:hover {
  border-color: #2c5af4;
}

.low {
  background: #dceeff;
}

.moderate {
  background: #a9d2ff;
}

.high {
  background: #6fafff;
}

.higher {
  background: #3b82f6;
}

/* 年份胶囊: 工作台样式 (白底 + wb-border + wb-accent 文字) */
.mc-year {
  align-items: center;
  height: 28px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  padding: 0 10px;
  font-size: 11.5px;
  font-weight: 800;
  color: #2c5af4;
}
</style>
