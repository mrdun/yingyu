<script setup lang="ts">
import dayjs from "dayjs";
import { computed, onMounted, ref } from "vue";

interface CalendarDay {
  date: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isCheckedIn: boolean;
}

const props = defineProps<{
  checkedInDates: string[];
}>();

const currentMonth = ref(dayjs());
const calendar = ref<CalendarDay[][]>([]);

function generateCalendar() {
  const year = currentMonth.value.year();
  const month = currentMonth.value.month();

  const firstDay = dayjs().year(year).month(month).date(1);
  const lastDay = dayjs().year(year).month(month).endOf("month");

  const startDayOfWeek = firstDay.day();
  const daysInMonth = lastDay.date();

  const days: CalendarDay[] = [];

  // 上个月的填充
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const date = firstDay.subtract(i + 1, "day");
    days.push({
      date: date.format("YYYY-MM-DD"),
      day: date.date(),
      isCurrentMonth: false,
      isToday: false,
      isCheckedIn: props.checkedInDates.includes(date.format("YYYY-MM-DD")),
    });
  }

  // 当前月
  const todayStr = dayjs().format("YYYY-MM-DD");
  for (let i = 1; i <= daysInMonth; i++) {
    const date = dayjs().year(year).month(month).date(i);
    const dateStr = date.format("YYYY-MM-DD");
    days.push({
      date: dateStr,
      day: i,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      isCheckedIn: props.checkedInDates.includes(dateStr),
    });
  }

  // 下个月的填充
  const remainingDays = 42 - days.length; // 6周 × 7天
  for (let i = 1; i <= remainingDays; i++) {
    const date = firstDay.add(daysInMonth + i - 1, "day");
    days.push({
      date: date.format("YYYY-MM-DD"),
      day: date.date(),
      isCurrentMonth: false,
      isToday: false,
      isCheckedIn: props.checkedInDates.includes(date.format("YYYY-MM-DD")),
    });
  }

  // 分组为周
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  calendar.value = weeks;
}

const monthName = computed(() => currentMonth.value.format("YYYY年 M月"));

const weekDays = ["日", "一", "二", "三", "四", "五", "六"];

/** 单格配色 (工作台调色板): 已打卡=浅蓝底蓝字 · 今天=主色实心 · 其它=wb-text */
function dayClass(day: CalendarDay): string {
  if (!day.isCurrentMonth) return "text-[#8D99A9]";
  if (day.isToday) return "bg-[#2C5AF4] font-extrabold text-white";
  if (day.isCheckedIn) return "bg-[#EFF6FF] font-bold text-[#2C5AF4]";

  return "text-[#1E293B] hover:bg-[#F1F4FD]";
}

function prevMonth() {
  currentMonth.value = currentMonth.value.subtract(1, "month");
  generateCalendar();
}

function nextMonth() {
  currentMonth.value = currentMonth.value.add(1, "month");
  generateCalendar();
}

onMounted(() => {
  generateCalendar();
});
</script>

<template>
  <!-- 历史月度打卡日历 (折叠在打卡卡内)。逻辑不变, 只把紫/绿配色换成工作台 wb-* 配色 -->
  <div class="rounded-[12px] border border-[#E5E7EB] bg-white p-4">
    <div class="mb-4 flex items-center justify-between">
      <button
        class="rounded px-2 py-1 text-[#666666] hover:bg-[#EFF6FF]"
        @click="prevMonth"
      >
        ◀
      </button>
      <h3 class="text-[15px] font-black text-[#1E293B]">
        {{ monthName }}
      </h3>
      <button
        class="rounded px-2 py-1 text-[#666666] hover:bg-[#EFF6FF]"
        @click="nextMonth"
      >
        ▶
      </button>
    </div>

    <div class="grid grid-cols-7 gap-1 text-center text-sm">
      <div
        v-for="day in weekDays"
        :key="day"
        class="py-1 text-xs font-medium text-[#666666]"
      >
        {{ day }}
      </div>

      <template
        v-for="(week, weekIndex) in calendar"
        :key="weekIndex"
      >
        <div
          v-for="day in week"
          :key="day.date"
          class="relative aspect-square cursor-pointer rounded-[9px] p-1 text-sm transition-colors"
          :class="dayClass(day)"
        >
          <span class="block">{{ day.day }}</span>
          <span
            v-if="day.isCheckedIn"
            class="absolute bottom-0.5 right-0.5 flex h-2 w-2"
          >
            <span class="relative inline-flex h-full w-full rounded-full bg-[#2C5AF4]"></span>
          </span>
        </div>
      </template>
    </div>

    <div class="mt-4 flex items-center justify-between text-xs text-[#666666]">
      <div class="flex items-center gap-2">
        <span class="flex h-3 w-3 rounded-full bg-[#A9D2FF]"></span>
        <span>已打卡</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="flex h-3 w-3 rounded-full bg-[#2C5AF4]"></span>
        <span>今天</span>
      </div>
    </div>
  </div>
</template>
