<template>
  <!--
    会员中心主页 (登录后 `/`)。

    外壳已由 layouts/default.vue 的工作台外壳提供 (固定侧栏 AppRail + 独立滚动的浅蓝面板),
    所以这里不再自带居中容器, 也不再内嵌任何导航 —— 只按 DESIGN.md `## Layout` 第 3 节的
    顺序铺 7 个区块, 全部数据来自现有接口 (本页不新增后端):
      1. 用户概览条 (UserOverviewBar)
      2. 会员转化横幅 (MembershipUpsell) —— **仅非会员**
      3. 学习数据 4 列 (LearningStatsRow)
      4. 打卡 + 每日任务 (CheckInCard + DailyTasksCard)
      5. 我的课程 (RecentCoursePack, 4 列 + 最后一格虚线「+ 添加课程」)
      6. 学习热力图 + 最近 7 天柱状图 (CalendarGraph + WeeklyStudyChart)
      7. 千句进度 (SentenceGoalCard)
  -->
  <div class="mc">
    <!-- 1. 用户概览条 -->
    <UserOverviewBar
      :avatar="userStore.user?.avatar"
      :username="userStore.user?.username || ''"
      :coins="coinBalance"
      :today-statements="todayStatements"
      :today-target="todayTarget"
      :streak="streak"
      :is-member="isMember"
    />

    <!-- 2. 会员转化横幅: 会员不渲染 (条件渲染的唯一依据就是下面的 isMember) -->
    <MembershipUpsell v-if="!isMember" />

    <!-- 3. 学习数据 4 列 (标题行右侧: 「+ 添加课程」与「成长报告 →」, 对标目标站的区块标题) -->
    <section>
      <div class="mc__head">
        <h3 class="mc__head-title">学习数据</h3>
        <div class="mc__head-actions">
          <NuxtLink
            to="/course-pack"
            class="mc__head-add"
          >
            + 添加课程
          </NuxtLink>
          <NuxtLink
            to="/stats"
            class="mc__head-link"
          >
            成长报告 →
          </NuxtLink>
        </div>
      </div>
      <LearningStatsRow
        :minutes="todayMinutes"
        :statements="todayStatements"
        :total-statements="totalStatements"
        :streak="streak"
      />
    </section>

    <!-- 4. 打卡 + 每日任务 -->
    <section class="mc__row">
      <CheckInCard
        class="mc__row-main"
        :streak="streak"
        :cumulative-days="cumulativeDays"
        :mastered-count="masteredCount"
        :total-learn-seconds="totalLearnSeconds"
        :checked-in-dates="checkedInDates"
        :checked-in="checkedIn"
        :loading="loading"
        :busy="checkingIn"
        :message="checkInMessage"
        @check-in="handleCheckIn"
      />
      <DailyTasksCard
        class="mc__row-side"
        :tasks="tasks"
        :loading="loading"
        :claiming="claiming"
        :today-earned="todayEarned"
        :message="taskMessage"
        @claim="handleClaim"
      />
    </section>

    <!-- 5. 我的课程 (4 列 + 最后一格虚线「+ 添加课程」, 由 RecentCoursePack 的 memberCenter 形态提供) -->
    <section>
      <div class="mc__head">
        <h3 class="mc__head-title">我的课程</h3>
        <NuxtLink
          to="/my-courses"
          class="mc__head-link"
        >
          全部 →
        </NuxtLink>
      </div>
      <HomeRecentCoursePack :member-center="true" />
    </section>

    <!-- 6. 学习热力图 + 最近 7 天柱状图 (1:1 双栏) -->
    <section class="mc__bottom">
      <div class="mc__card">
        <div class="mc__head">
          <h3 class="mc__head-title">学习热力图</h3>
          <NuxtLink
            to="/stats"
            class="mc__head-link"
          >
            看成长报告 →
          </NuxtLink>
        </div>
        <HomeCalendarGraph
          :data="learningDailyTimeList"
          :total-learning-time="learningDailyTotalTime"
          @toggle-year="setupLearningDailyTime"
        />
      </div>

      <div class="mc__card">
        <div class="mc__head">
          <h3 class="mc__head-title">最近 7 天</h3>
          <NuxtLink
            to="/stats"
            class="mc__head-link"
          >
            详细数据 →
          </NuxtLink>
        </div>
        <WeeklyStudyChart :data="dailyStats" />
      </div>
    </section>

    <!-- 7. 千句进度 -->
    <SentenceGoalCard :mastered="masteredCount" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import type { CheckInResponse, TodayTask } from "~/api/coins";
import type { DailyStat, StatsOverview } from "~/api/stats";
import { checkInTask, fetchCheckInHistory, fetchCoinBalance, fetchTodayTasks } from "~/api/coins";
import { fetchStatsDaily, fetchStatsOverview } from "~/api/stats";
import { fetchTodayLearningTime } from "~/api/user-learning-activity";
import CheckInCard from "~/components/CheckInCard.vue";
import HomeRecentCoursePack from "~/components/courses/RecentCoursePack.vue";
import DailyTasksCard from "~/components/DailyTasksCard.vue";
import HomeCalendarGraph from "~/components/Home/CalendarGraph.vue";
import LearningStatsRow from "~/components/Home/LearningStatsRow.vue";
import MembershipUpsell from "~/components/Home/MembershipUpsell.vue";
import SentenceGoalCard from "~/components/Home/SentenceGoalCard.vue";
import UserOverviewBar from "~/components/Home/UserOverviewBar.vue";
import WeeklyStudyChart from "~/components/Home/WeeklyStudyChart.vue";
import { useLearningDailyTime } from "~/composables/learningDailyTime";
import { useLearningTimeTracker } from "~/composables/main/learningTimeTracker";
import { useUserStore } from "~/store/user";
import { safeNumber, secondsToMinutes } from "~/utils/memberCenter";

const userStore = useUserStore();
const { learningDailyTimeList, learningDailyTotalTime, setupLearningDailyTime } =
  useLearningDailyTime();
const { setupLearningTime } = useLearningTimeTracker();

/**
 * 本页是**单一数据源**: 打卡卡与每日任务卡都是纯展示组件,
 * 所以打卡/领取之后只需重新取一次数, 概览条 · 4 列数据 · 千句进度会一起更新,
 * 不会出现「打卡卡显示 1 天、概览条还显示 0 天」这种两套数字。
 */
const loading = ref(true);
const coinBalance = ref(0);
const todayEarned = ref(0);
const tasks = ref<TodayTask[]>([]);
const overview = ref<StatsOverview | null>(null);
const dailyStats = ref<DailyStat[]>([]);
const checkedInDates = ref<string[]>([]);
const todaySeconds = ref(0);

const checkingIn = ref(false);
const claiming = ref("");
const checkInMessage = ref("");
const taskMessage = ref("");

const dailyCheckInTask = computed(() =>
  tasks.value.find((task) => task.taskType === "daily_check_in"),
);
const studyTask = computed(() => tasks.value.find((task) => task.taskType === "study_10"));

/** 今日练习句数 = 「学习 10 句」任务的进度 (空态 0/10) */
const todayStatements = computed(() => safeNumber(studyTask.value?.current));
const todayTarget = computed(() => safeNumber(studyTask.value?.target, 10));
const todayMinutes = computed(() => secondsToMinutes(todaySeconds.value));

const streak = computed(() => safeNumber(overview.value?.reviewStreak));
const masteredCount = computed(() => safeNumber(overview.value?.masteredCount));
/** 累计练习句数: 学习数据第三张卡用这个 (不是 masteredCount), 与目标站口径一致 */
const totalStatements = computed(() => safeNumber(overview.value?.totalStatements));
const cumulativeDays = computed(() => safeNumber(overview.value?.totalLearnDays));
const totalLearnSeconds = computed(() => safeNumber(overview.value?.totalLearnDurationSeconds));
const checkedIn = computed(() => Boolean(dailyCheckInTask.value?.claimed));

/**
 * 会员判定 (转化横幅的唯一开关): 创始会员 或 /user 返回的 membership.isMember。
 * 判定沿用 useUserStore 的数据, 不额外请求 /membership/status。
 */
const isMember = computed(
  () => userStore.isFounderMembership() || Boolean(userStore.user?.membership?.isMember),
);

async function load(silent = false) {
  if (!silent) loading.value = true;

  try {
    const [balance, todayTasks, statsOverview, seconds, daily, history] = await Promise.all([
      fetchCoinBalance(),
      fetchTodayTasks(),
      fetchStatsOverview(),
      fetchTodayLearningTime(),
      fetchStatsDaily(7),
      fetchCheckInHistory(),
    ]);

    coinBalance.value = safeNumber(balance?.coins);
    todayEarned.value = safeNumber(balance?.todayEarned);
    tasks.value = todayTasks?.tasks ?? [];
    overview.value = statsOverview ?? null;
    todaySeconds.value = safeNumber(seconds);
    dailyStats.value = Array.isArray(daily) ? daily : [];
    checkedInDates.value = history?.dates ?? [];

    // 与改造前一致: 把今日已学秒数写进 localStorage, 供学习时长跟踪器接着往上加
    setupLearningTime(todaySeconds.value);
  } catch (e) {
    // 空态兜底: 任何一个接口失败都保留 0 值, 页面照常渲染 (不白屏、不显示非法数字)
    console.error("加载会员中心主页数据失败", e);
  } finally {
    loading.value = false;
  }
}

async function handleCheckIn() {
  if (checkingIn.value || checkedIn.value) return;

  checkingIn.value = true;
  checkInMessage.value = "";

  try {
    const res: CheckInResponse = await checkInTask("daily_check_in");

    if (res.granted) {
      checkInMessage.value = `🎉 打卡成功！连续打卡 ${res.streak} 天`;
      if (res.streakBonus > 0) {
        checkInMessage.value += `，连击奖励 +${res.streakBonus} 金币！`;
      }
      await load(true);
    } else if (res.alreadyDone) {
      checkInMessage.value = "今日已打卡";
      await load(true);
    } else {
      checkInMessage.value = "打卡失败，请稍后再试";
    }
  } catch (e) {
    console.error("打卡失败", e);
    checkInMessage.value = "打卡失败，请稍后再试";
  } finally {
    checkingIn.value = false;
  }
}

async function handleClaim(task: TodayTask) {
  taskMessage.value = "";
  claiming.value = task.taskType;

  try {
    const res: CheckInResponse = await checkInTask(task.taskType);

    if (res.granted) {
      const bonus = res.streakBonus > 0 ? `，连击奖励 +${res.streakBonus} 金币！` : "！";
      taskMessage.value = `🎉 获得 ${res.rewardCoins} 金币${bonus}`;
    } else if (res.alreadyDone) {
      taskMessage.value = "今日已领取过该任务奖励";
    } else {
      taskMessage.value = "还未达到任务条件，先去完成吧";
    }
  } catch (e) {
    console.error("领取奖励失败", e);
    taskMessage.value = "领取失败，请稍后再试";
  } finally {
    claiming.value = "";
    await load(true);
  }
}

onMounted(() => {
  load();
});
</script>

<style scoped>
/* 区块之间 12px 堆叠 (DESIGN.md 工作台栅格) */
.mc {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mc__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.mc__head-title {
  font-size: 14.5px;
  font-weight: 900;
  color: #1e293b;
}

.mc__head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/*
 * 「+ 添加课程」: 对标目标站区块标题右侧那颗按钮 —— 虚线描边的次级动作,
 * 不用主色实心 (实心留给区块内真正的主动作, 否则一屏多个实心按钮抢焦点)。
 */
.mc__head-add {
  font-size: 11.5px;
  font-weight: 800;
  color: #2a64e7;
  text-decoration: none;
  padding: 3px 10px;
  border: 1px dashed #b9cdfb;
  border-radius: 999px;
  background: #f5f8ff;
}

.mc__head-add:hover {
  border-style: solid;
  border-color: #2a64e7;
}

.mc__head-link {
  font-size: 11.5px;
  font-weight: 800;
  color: #2a64e7;
  text-decoration: none;
}

.mc__head-link:hover {
  text-decoration: underline;
}

/* 4. 打卡 (自适应宽) + 每日任务 (固定 292px, 与设计稿一致) */
.mc__row {
  display: flex;
  align-items: stretch;
  gap: 12px;
}

.mc__row-main {
  flex: 1;
  min-width: 0;
}

.mc__row-side {
  width: 292px;
  flex-shrink: 0;
}

/* 6. 热力图 + 7 天柱状图: 1:1 双栏 */
.mc__bottom {
  display: flex;
  gap: 12px;
}

.mc__bottom > * {
  flex: 1;
  min-width: 0;
}

.mc__card {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
  padding: 15px 17px;
}

/* 断点沿用项目现状: 1024 / 768 / 480 */
@media (max-width: 1024px) {
  .mc__row,
  .mc__bottom {
    flex-direction: column;
  }

  .mc__row-side {
    width: auto;
  }
}
</style>
