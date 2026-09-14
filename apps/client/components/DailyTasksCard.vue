<template>
  <!--
    区块 4 右: 每日任务 (3 条进度 + 今日已得)。

    数据与交互沿用改造前的 DailyTasksCard: 任务列表来自 fetchTodayTasks(),
    领取仍然调 checkInTask(taskType) —— 但请求由父级 (components/Home/index.vue) 发出,
    这样打卡/领取之后整页 (概览条 · 4 列数据 · 千句进度) 能一起刷新, 不会出现两套数字。
  -->
  <section class="tasks">
    <div class="tasks__head">
      <h3 class="tasks__title">每日任务</h3>
      <NuxtLink
        to="/rewards"
        class="tasks__more"
      >
        全部 →
      </NuxtLink>
    </div>

    <p
      v-if="props.loading"
      class="tasks__empty"
    >
      加载中...
    </p>

    <p
      v-else-if="rows.length === 0"
      class="tasks__empty"
    >
      暂时拿不到今日任务，稍后再刷新看看
    </p>

    <template v-else>
      <div
        v-for="row in rows"
        :key="row.taskType"
        class="tasks__row"
      >
        <div class="tasks__row-top">
          <span class="tasks__row-name">{{ row.name }}</span>

          <span
            v-if="row.task?.claimed"
            class="tasks__chip"
          >
            已完成
          </span>
          <button
            v-else-if="row.task?.goalMet"
            type="button"
            class="tasks__claim"
            :disabled="props.claiming === row.taskType"
            @click="emit('claim', row.task!)"
          >
            领取 🪙{{ row.task?.rewardCoins ?? 0 }}
          </button>
          <span class="tasks__progress-text">
            <b>{{ formatCount(row.current) }}</b
            >/{{ formatCount(row.target) }}
          </span>
        </div>

        <div class="tasks__bar">
          <i
            :class="{ 'tasks__bar--reward': row.reward }"
            :style="{ width: progressWidth(row.current, row.target) }"
          ></i>
        </div>
      </div>

      <div class="tasks__earned">
        <span class="tasks__row-name">今日已得</span>
        <span class="tasks__earned-v">+{{ formatCount(props.todayEarned) }} 币</span>
      </div>
    </template>

    <p
      v-if="props.message"
      class="tasks__msg"
    >
      {{ props.message }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";

import type { TodayTask } from "~/api/coins";
import { formatCount, progressWidth, safeNumber } from "~/utils/memberCenter";

const props = defineProps<{
  /** fetchTodayTasks().tasks */
  tasks: TodayTask[];
  loading: boolean;
  /** 正在领取的 taskType (按钮禁用用) */
  claiming: string;
  /** fetchCoinBalance().todayEarned */
  todayEarned: number;
  message: string;
}>();

const emit = defineEmits<{
  (event: "claim", task: TodayTask): void;
}>();

/** 三行固定顺序: 打卡 / 学习 10 句 / SSS 评级 (与原组件一致, 打卡不在打卡卡里重复) */
const rowDefs: { taskType: TodayTask["taskType"]; name: string; reward: boolean }[] = [
  { taskType: "daily_check_in", name: "今日打卡", reward: true },
  { taskType: "study_10", name: "学习 10 句", reward: false },
  { taskType: "sss_once", name: "拿到 1 次 SSS", reward: true },
];

const rows = computed(() =>
  rowDefs.flatMap((def) => {
    const task = props.tasks.find((item) => item.taskType === def.taskType);
    if (!task) return [];

    return [
      {
        taskType: def.taskType,
        name: def.name,
        reward: def.reward,
        task,
        current: safeNumber(task.current),
        target: safeNumber(task.target),
      },
    ];
  }),
);
</script>

<style scoped>
.tasks {
  display: flex;
  flex-direction: column;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
  padding: 15px 17px;
}

.tasks__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.tasks__title {
  font-size: 14.5px;
  font-weight: 900;
  color: #1e293b;
}

.tasks__more {
  font-size: 11.5px;
  font-weight: 800;
  color: #2a64e7;
  text-decoration: none;
}

.tasks__empty {
  padding: 14px 0;
  font-size: 12px;
  font-weight: 600;
  color: #666666;
}

.tasks__row {
  margin-bottom: 12px;
}

.tasks__row-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #666666;
}

.tasks__row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tasks__progress-text {
  font-size: 12px;
  font-weight: 700;
  color: #666666;
}

.tasks__progress-text b {
  color: #1e293b;
  font-weight: 900;
}

.tasks__claim {
  border: none;
  border-radius: 8px;
  background: #2c5af4;
  color: #fff;
  padding: 3px 9px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.tasks__claim:disabled {
  background: #c7d4f7;
  cursor: not-allowed;
}

.tasks__chip {
  border: 1px solid #a7e8bf;
  border-radius: 999px;
  background: #dcfce7;
  color: #166534;
  padding: 2px 8px;
  font-size: 10.5px;
  font-weight: 800;
}

.tasks__bar {
  height: 7px;
  border-radius: 999px;
  background: #f2f4f8;
  overflow: hidden;
}

.tasks__bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: #2c5af4;
}

/* 奖励类任务用黄色进度 (DESIGN.md: 奖励类进度 #FFB300→#FFC72E) */
.tasks__bar i.tasks__bar--reward {
  background: linear-gradient(90deg, #ffb300, #ffc72e);
}

.tasks__earned {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px dashed #e5e7eb;
  font-size: 12px;
  font-weight: 700;
  color: #666666;
}

.tasks__earned-v {
  font-size: 14px;
  font-weight: 900;
  color: #2a64e7;
}

.tasks__msg {
  margin-top: 10px;
  font-size: 12px;
  font-weight: 700;
  color: #2a64e7;
}
</style>
