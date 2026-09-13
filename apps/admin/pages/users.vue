<script setup lang="ts">
import { computed, ref } from "vue";

import StatusBadge from "~/components/status/StatusBadge.vue";
import DataTable from "~/components/table/DataTable.vue";
import AppInput from "~/components/form/AppInput.vue";
import AppButton from "~/components/ui/AppButton.vue";
import AppEmpty from "~/components/ui/AppEmpty.vue";
import AppError from "~/components/ui/AppError.vue";
import AppLoading from "~/components/ui/AppLoading.vue";
import AppModal from "~/components/ui/AppModal.vue";
import AppPagination from "~/components/ui/AppPagination.vue";
import { useRelogin } from "~/composables/useRelogin";
import { useServerPagedList } from "~/composables/useServerPagedList";
import { fetchAdminUsersPage } from "~/services/users.service";
import type { AdminUserRow } from "~/types/admin";
import type { TableColumn } from "~/types/ui";
import { MISSING_TEXT, formatCount, formatDateTime, formatDurationSeconds } from "~/utils/format";

/**
 * 用户管理 (GET /admin/users?page&pageSize&keyword)。
 *
 * 只读页面: 用户身份在 Logto, 本页不做任何用户写操作。
 * 安全约束: 接口只返回用户名/注册时间/学习统计; 密码、登录令牌、密钥这类凭证
 * 既不在接口返回里, 页面也不展示 (页面不请求任何凭证字段)。
 *
 * 后端缺口 (只报告, 本批次不新增接口): 接口不返回「会员状态」与「Partner 状态」,
 * 这两个字段统一显示为「暂无数据」并注明原因, 不用学习数据反推。
 */

const COLUMNS: TableColumn[] = [
  { key: "username", label: "用户名" },
  { key: "userId", label: "用户 ID" },
  { key: "createdAt", label: "注册时间" },
  { key: "todayStatements", label: "今日句子", align: "right" },
  { key: "totalStatements", label: "累计句子", align: "right" },
  { key: "duration", label: "累计时长" },
  { key: "membership", label: "会员状态" },
  { key: "actions", label: "操作", align: "right" },
];

/** 取不到的字段: 明确标注, 不编造、不新增接口 */
const NO_DATA = "暂无数据";
const UNAVAILABLE_FIELDS = [
  {
    label: "会员状态",
    note: "GET /admin/users 不返回会员状态 (缺少按用户查询会员的接口)",
  },
  {
    label: "Partner 状态",
    note: "GET /admin/users 不返回 Partner 状态 (缺少按用户查询 Partner 的接口)",
  },
];

const keyword = ref("");
const list = useServerPagedList<AdminUserRow>((params) =>
  fetchAdminUsersPage({ ...params, keyword: keyword.value }),
);
const relogin = useRelogin();

const selected = ref<AdminUserRow | null>(null);
const detailOpen = ref(false);

const users = computed(() => list.items.value);

/** 详情视图: 空值兜底, 模板里不做可选链 (字段本身全部来自接口返回值) */
const selectedView = computed(() => {
  const row = selected.value;
  return {
    username: row?.username ?? null,
    userId: row?.userId ?? MISSING_TEXT,
    createdAt: row?.createdAt ?? null,
    todayStatements: row?.todayStatements,
    totalStatements: row?.totalStatements,
    totalDurationSeconds: row?.totalDurationSeconds,
  };
});

function openDetail(row: AdminUserRow): void {
  selected.value = row;
  detailOpen.value = true;
}

function onSearch(): void {
  void list.reload();
}

function onResetKeyword(): void {
  keyword.value = "";
  void list.reload();
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-xs text-base-content/60">
        数据来源: GET /admin/users。接口只返回用户名、注册时间与学习统计 ——
        密码、登录凭证、密钥这类敏感字段既不在返回里, 也不在本页展示。
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <div class="w-56">
          <AppInput
            v-model="keyword"
            placeholder="用户名 / 邮箱关键词"
            @keyup.enter="onSearch"
          />
        </div>
        <AppButton
          size="sm"
          variant="outline"
          :loading="list.pending.value"
          @click="onSearch"
        >
          搜索
        </AppButton>
        <AppButton
          size="sm"
          variant="ghost"
          :disabled="list.pending.value"
          @click="onResetKeyword"
        >
          重置
        </AppButton>
      </div>
    </div>

    <div class="overflow-hidden rounded-box border border-base-300 bg-base-100">
      <AppLoading
        v-if="list.pending.value && users.length === 0"
        label="正在加载用户列表"
      />
      <AppError
        v-else-if="list.errorMessage.value"
        title="用户列表加载失败"
        :message="list.errorMessage.value"
        :status-code="list.statusCode.value"
        :show-sign-in="list.unauthenticated.value"
        @retry="list.load"
        @sign-in="relogin"
      />
      <AppEmpty
        v-else-if="list.isEmpty.value"
        title="没有匹配的用户"
        :description="keyword ? `关键词「${keyword}」没有匹配到用户。` : '后端没有返回任何用户。'"
      />
      <DataTable
        v-else
        :columns="COLUMNS"
      >
        <tr
          v-for="user in users"
          :key="user.userId"
          class="hover"
        >
          <td class="text-sm font-medium">{{ user.username ?? MISSING_TEXT }}</td>
          <td class="font-mono text-xs text-base-content/70">{{ user.userId }}</td>
          <td class="text-xs">{{ formatDateTime(user.createdAt) }}</td>
          <td class="text-right text-sm tabular-nums">
            {{ formatCount(user.todayStatements) }}
          </td>
          <td class="text-right text-sm tabular-nums">
            {{ formatCount(user.totalStatements) }}
          </td>
          <td class="text-xs">{{ formatDurationSeconds(user.totalDurationSeconds) }}</td>
          <td>
            <StatusBadge
              :label="NO_DATA"
              tone="neutral"
            />
          </td>
          <td>
            <div class="flex items-center justify-end">
              <AppButton
                size="sm"
                variant="outline"
                @click="openDetail(user)"
              >
                详情
              </AppButton>
            </div>
          </td>
        </tr>
      </DataTable>
      <AppPagination
        v-if="!list.pending.value && !list.errorMessage.value && !list.isEmpty.value"
        :page="list.page.value"
        :total-pages="list.totalPages.value"
        :total="list.total.value"
        :page-size="list.pageSize.value"
        @update:page="list.setPage"
      />
    </div>

    <AppModal
      v-model="detailOpen"
      title="用户详情"
      description="只展示 GET /admin/users 返回的字段; 取不到的字段标注「暂无数据」"
    >
      <div
        v-if="selected"
        class="flex flex-col gap-3"
      >
        <dl class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">用户名</dt>
            <dd class="text-sm">{{ selectedView.username ?? MISSING_TEXT }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">用户 ID</dt>
            <dd class="break-all font-mono text-xs">{{ selectedView.userId }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">注册时间</dt>
            <dd class="text-sm">{{ formatDateTime(selectedView.createdAt) }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">学习概况</dt>
            <dd class="text-sm">
              今日 {{ formatCount(selectedView.todayStatements) }} 句 / 累计
              {{ formatCount(selectedView.totalStatements) }} 句 / 时长
              {{ formatDurationSeconds(selectedView.totalDurationSeconds) }}
            </dd>
          </div>
        </dl>

        <div class="rounded-box border border-dashed border-base-300 px-3 py-3">
          <p class="text-xs font-medium text-base-content/70">
            以下字段当前接口取不到, 统一显示为「{{ NO_DATA }}」
          </p>
          <ul class="mt-2 flex flex-col gap-1">
            <li
              v-for="field in UNAVAILABLE_FIELDS"
              :key="field.label"
              class="flex flex-wrap items-center justify-between gap-2"
            >
              <span class="text-xs text-base-content/80">{{ field.label }}</span>
              <span class="flex items-center gap-2">
                <span class="text-xs text-base-content/50">{{ NO_DATA }}</span>
                <span class="text-xs text-base-content/40">{{ field.note }}</span>
              </span>
            </li>
          </ul>
        </div>
      </div>
      <template #footer>
        <AppButton
          size="sm"
          variant="ghost"
          @click="detailOpen = false"
        >
          关闭
        </AppButton>
      </template>
    </AppModal>
  </div>
</template>
