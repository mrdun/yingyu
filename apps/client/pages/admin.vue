<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import type { AdminCoursePackRow, AdminOverview, AdminUserRow } from "~/api/admin";
import {
  fetchAdminCoursePacks,
  fetchAdminOverview,
  fetchAdminUsers,
  toggleCoursePackFree,
} from "~/api/admin";
import { signIn } from "~/services/auth";

const loading = ref(true);
const needLogin = ref(false);
const noPermission = ref(false);
const errorMessage = ref("");

const overview = ref<AdminOverview | null>(null);
const coursePacks = ref<AdminCoursePackRow[]>([]);
const users = ref<AdminUserRow[]>([]);
const usersTotal = ref(0);
const usersPage = ref(1);
const USERS_PAGE_SIZE = 20;
const togglingId = ref("");

const overviewCards = computed(() => {
  const o = overview.value;
  return [
    { label: "用户数", value: o?.userCount ?? 0 },
    { label: "今日活跃", value: o?.activeToday ?? 0 },
    { label: "课程包数", value: o?.coursePackCount ?? 0 },
    { label: "句子总数", value: o?.statementCount ?? 0 },
    { label: "复习记录总数", value: o?.totalReviewRecords ?? 0 },
    { label: "今日学习句数", value: o?.todayLearnStatements ?? 0 },
  ];
});

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0 && m === 0) return "0m";
  return `${h}h ${m}m`;
}

async function loadAll() {
  loading.value = true;
  needLogin.value = false;
  noPermission.value = false;
  errorMessage.value = "";
  try {
    const [overviewData, packData] = await Promise.all([
      fetchAdminOverview(),
      fetchAdminCoursePacks({ page: 1, pageSize: 50 }),
    ]);
    overview.value = overviewData;
    coursePacks.value = packData.coursePacks;
    await loadUsers(usersPage.value);
  } catch (e: any) {
    const status = e?.status ?? e?.statusCode;
    if (status === 401) {
      needLogin.value = true;
    } else if (status === 403) {
      noPermission.value = true;
    } else {
      errorMessage.value = "加载管理数据失败，请稍后再试";
    }
  } finally {
    loading.value = false;
  }
}

async function loadUsers(page: number) {
  const data = await fetchAdminUsers({ page, pageSize: USERS_PAGE_SIZE });
  users.value = data.users;
  usersTotal.value = data.total;
  usersPage.value = data.page;
}

async function onToggleFree(pack: AdminCoursePackRow) {
  togglingId.value = pack.id;
  try {
    const result = await toggleCoursePackFree(pack.id);
    pack.isFree = result.isFree;
  } catch (e: any) {
    const status = e?.status ?? e?.statusCode;
    if (status === 403) noPermission.value = true;
  } finally {
    togglingId.value = "";
  }
}

const usersTotalPages = computed(() => Math.max(Math.ceil(usersTotal.value / USERS_PAGE_SIZE), 1));

async function goToPage(page: number) {
  if (page < 1 || page > usersTotalPages.value) return;
  try {
    await loadUsers(page);
  } catch (e: any) {
    const status = e?.status ?? e?.statusCode;
    if (status === 403) noPermission.value = true;
  }
}

onMounted(loadAll);
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-6">
    <div class="mb-6 flex items-center gap-4">
      <h1 class="text-2xl font-bold">管理后台</h1>
      <nav class="flex gap-2 text-sm">
        <span class="btn btn-primary btn-xs">总览</span>
        <NuxtLink
          class="btn btn-xs"
          to="/admin/dashboard"
        >
          商业看板
        </NuxtLink>
        <NuxtLink
          class="btn btn-xs"
          to="/admin/plans"
        >
          会员方案
        </NuxtLink>
      </nav>
    </div>

    <div
      v-if="loading"
      class="py-20 text-center"
    >
      <span class="loading loading-spinner loading-lg"></span>
    </div>

    <div
      v-else-if="needLogin"
      class="alert alert-warning justify-center"
    >
      请先登录
      <button
        class="btn btn-primary btn-sm"
        @click="signIn()"
      >
        登录
      </button>
    </div>

    <div
      v-else-if="noPermission"
      class="alert alert-error justify-center"
    >
      无管理员权限
    </div>

    <div
      v-else-if="errorMessage"
      class="alert alert-error justify-center"
    >
      {{ errorMessage }}
    </div>

    <template v-else>
      <!-- 总览卡片 -->
      <div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <div
          v-for="card in overviewCards"
          :key="card.label"
          class="stat rounded-lg bg-base-200 shadow"
        >
          <div class="stat-title text-xs">{{ card.label }}</div>
          <div class="stat-value text-2xl">{{ card.value }}</div>
        </div>
      </div>

      <!-- 课程包管理 -->
      <h2 class="mb-2 mt-8 text-lg font-semibold">课程包管理</h2>
      <div class="overflow-x-auto rounded-lg bg-base-200">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>标题</th>
              <th>课程数</th>
              <th>句数</th>
              <th>是否免费</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="pack in coursePacks"
              :key="pack.id"
            >
              <td>{{ pack.title }}</td>
              <td>{{ pack.courseCount }}</td>
              <td>{{ pack.statementCount }}</td>
              <td>
                <span :class="pack.isFree ? 'badge badge-success' : 'badge badge-ghost'">
                  {{ pack.isFree ? "免费" : "收费" }}
                </span>
              </td>
              <td>
                <button
                  class="btn btn-outline btn-xs"
                  :disabled="togglingId === pack.id"
                  @click="onToggleFree(pack)"
                >
                  {{ pack.isFree ? "设为收费" : "设为免费" }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 用户列表 -->
      <h2 class="mb-2 mt-8 text-lg font-semibold">用户列表</h2>
      <div class="overflow-x-auto rounded-lg bg-base-200">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>用户 ID</th>
              <th>用户名</th>
              <th>注册时间</th>
              <th>今日句数</th>
              <th>总句数</th>
              <th>总时长</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="user in users"
              :key="user.userId"
            >
              <td class="font-mono text-xs">{{ user.userId }}</td>
              <td>{{ user.username ?? "-" }}</td>
              <td>{{ user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-" }}</td>
              <td>{{ user.todayStatements }}</td>
              <td>{{ user.totalStatements }}</td>
              <td>{{ formatDuration(user.totalDurationSeconds) }}</td>
            </tr>
            <tr v-if="users.length === 0">
              <td
                colspan="6"
                class="text-center text-base-content/60"
              >
                暂无用户
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex items-center justify-center gap-2">
        <button
          class="btn btn-xs"
          :disabled="usersPage <= 1"
          @click="goToPage(usersPage - 1)"
        >
          上一页
        </button>
        <span class="text-sm">{{ usersPage }} / {{ usersTotalPages }}</span>
        <button
          class="btn btn-xs"
          :disabled="usersPage >= usersTotalPages"
          @click="goToPage(usersPage + 1)"
        >
          下一页
        </button>
      </div>
    </template>
  </div>
</template>
