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
  <div
    class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
  >
    <div class="mb-4 flex items-center justify-between">
      <button
        class="rounded px-2 py-1 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        @click="prevMonth"
      >
        ◀
      </button>
      <h3 class="text-lg font-semibold text-gray-700 dark:text-gray-200">
        {{ monthName }}
      </h3>
      <button
        class="rounded px-2 py-1 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        @click="nextMonth"
      >
        ▶
      </button>
    </div>

    <div class="grid grid-cols-7 gap-1 text-center text-sm">
      <div
        v-for="day in weekDays"
        :key="day"
        class="py-1 text-xs font-medium text-gray-500 dark:text-gray-400"
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
          class="relative aspect-square rounded-md p-1 text-sm transition-colors"
          :class="{
            'text-gray-400': !day.isCurrentMonth,
            'text-gray-700 dark:text-gray-200': day.isCurrentMonth && !day.isToday,
            'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300': day.isToday,
            'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300':
              day.isCheckedIn && !day.isToday,
            'bg-purple-200 text-purple-800 dark:bg-purple-800/50 dark:text-purple-200':
              day.isToday && day.isCheckedIn,
            'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700': day.isCurrentMonth,
          }"
        >
          <span class="block">{{ day.day }}</span>
          <span
            v-if="day.isCheckedIn"
            class="absolute bottom-0.5 right-0.5 flex h-2 w-2"
          >
            <span class="relative inline-flex h-full w-full rounded-full bg-green-500">
              <span
                class="absolute inline-flex h-full w-full animate-pulse rounded-full bg-green-400 opacity-75"
              ></span>
            </span>
          </span>
        </div>
      </template>
    </div>

    <div class="mt-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
      <div class="flex items-center gap-2">
        <span class="flex h-3 w-3 rounded-full bg-green-500"></span>
        <span>已打卡</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="flex h-3 w-3 rounded-full bg-purple-300"></span>
        <span>今天</span>
      </div>
    </div>
  </div>
</template>
