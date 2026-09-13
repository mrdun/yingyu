<script setup lang="ts">
import type { AdminStatementRow } from "~/types/admin";
import type { StatementFormSubmit, TableColumn } from "~/types/ui";

import { navigateTo } from "nuxt/app";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";

import StatementFormModal from "~/components/form/StatementFormModal.vue";
import StatusBadge from "~/components/status/StatusBadge.vue";
import DataTable from "~/components/table/DataTable.vue";
import AppButton from "~/components/ui/AppButton.vue";
import AppConfirmDialog from "~/components/ui/AppConfirmDialog.vue";
import AppEmpty from "~/components/ui/AppEmpty.vue";
import AppError from "~/components/ui/AppError.vue";
import AppLoading from "~/components/ui/AppLoading.vue";
import AppPagination from "~/components/ui/AppPagination.vue";
import { useAdminToast } from "~/composables/useAdminToast";
import { useAsyncResource } from "~/composables/useAsyncResource";
import { useRelogin } from "~/composables/useRelogin";
import { useServerPagedList } from "~/composables/useServerPagedList";
import { getErrorMessage } from "~/services/admin-api";
import {
  createStatement,
  deleteStatement,
  fetchCoursePackDetail,
  fetchCourseStatementsPage,
  updateStatement,
} from "~/services/courses.service";
import { presentStatementSourceType, presentTimeline } from "~/utils/courseStatus";
import { formatCount } from "~/utils/format";
import { buildOrderSwapPayloads } from "~/utils/reorder";

/**
 * 语句编辑器 (GET /admin/courses/:courseId/statements, 服务端分页 + order 升序)。
 *
 * 语句列表接口是本批次新增的只读接口: 公开接口只暴露 published 内容, 管理端此前
 * 没有任何语句读取方法, 草稿里的语句无法核对。
 *
 * 排序: 数字 order 直接编辑, 或上移/下移 —— 两者都是对既有
 * PATCH /admin/statements/:statementId 发 {order}, **没有**新增批量排序接口。
 *
 * 校验只在表单层 (utils/statementForm.ts): 音频类型才要求音频与时间轴,
 * startMs/endMs 必须是非负整数且 endMs > startMs。
 */

const COLUMNS: TableColumn[] = [
  { key: "order", label: "排序", align: "right" },
  { key: "sourceType", label: "素材类型" },
  { key: "content", label: "中文 / 英文" },
  { key: "soundmark", label: "音标" },
  { key: "audio", label: "音频 / 时间轴" },
  { key: "actions", label: "操作", align: "right" },
];

const route = useRoute();
const coursePackId = computed(() => String(route.params.id ?? ""));
const courseId = computed(() => String(route.params.courseId ?? ""));

const detail = useAsyncResource(() => fetchCoursePackDetail(coursePackId.value));
const list = useServerPagedList<AdminStatementRow>((params) =>
  fetchCourseStatementsPage(courseId.value, params),
);
const toast = useAdminToast();
const relogin = useRelogin();

const pack = computed(() => detail.data.value);
const course = computed(
  () => detail.data.value?.courses.find((item) => item.id === courseId.value) ?? null,
);
const statements = computed<AdminStatementRow[]>(() => list.items.value);

const formOpen = ref(false);
const formMode = ref<"create" | "edit">("create");
const editingStatement = ref<AdminStatementRow | null>(null);
const submitting = ref(false);

const confirmOpen = ref(false);
const confirmLoading = ref(false);
const confirmMessage = ref("");
const reorderingId = ref<string | null>(null);
let pendingAction: (() => Promise<void>) | null = null;

function openCreate(): void {
  formMode.value = "create";
  editingStatement.value = null;
  formOpen.value = true;
}

function openEdit(statement: AdminStatementRow): void {
  formMode.value = "edit";
  editingStatement.value = statement;
  formOpen.value = true;
}

async function onSubmitForm(submit: StatementFormSubmit): Promise<void> {
  if (submitting.value) return;
  submitting.value = true;
  try {
    if (submit.mode === "create") {
      await createStatement(courseId.value, submit.payload);
      toast.success("语句已新增", "顺序由 order 决定, 可用上移/下移调整。");
    } else {
      await updateStatement(submit.statementId, submit.payload);
      toast.success("语句已更新", "课程包会退回草稿, 需重新审核发布 (后端规则)。");
    }
    formOpen.value = false;
    await list.load();
  } catch (error) {
    // 后端拒绝 (归档包 / 校验失败) → 原文展示, 不改本地数据
    toast.error("保存失败", getErrorMessage(error));
  } finally {
    submitting.value = false;
  }
}

function askDelete(statement: AdminStatementRow): void {
  confirmMessage.value =
    `确认删除第 ${statement.order} 条语句「${statement.english}」? ` +
    `该语句的学习进度与复习记录会一并清理, 操作不可撤销。`;
  pendingAction = async () => {
    await deleteStatement(statement.id);
  };
  confirmOpen.value = true;
}

async function runPendingAction(): Promise<void> {
  if (!pendingAction || confirmLoading.value) return;
  confirmLoading.value = true;
  try {
    await pendingAction();
    toast.success("语句已删除");
  } catch (error) {
    toast.error("删除失败 (后端拒绝)", getErrorMessage(error));
  } finally {
    confirmLoading.value = false;
    confirmOpen.value = false;
    pendingAction = null;
    await list.load();
  }
}

/** 上移 / 下移: 只对相邻两条发既有 PATCH {order} */
async function move(statement: AdminStatementRow, direction: -1 | 1): Promise<void> {
  const index = statements.value.findIndex((item) => item.id === statement.id);
  const payloads = buildOrderSwapPayloads(statements.value, index, direction);
  if (!payloads) {
    toast.info(direction < 0 ? "已经是本页第一条" : "已经是本页最后一条");
    return;
  }

  reorderingId.value = statement.id;
  try {
    for (const change of payloads) {
      await updateStatement(change.id, { order: change.order });
    }
    await list.load();
    toast.success("排序已更新");
  } catch (error) {
    toast.error("排序失败", getErrorMessage(error));
  } finally {
    reorderingId.value = null;
  }
}

async function backToCoursePack(): Promise<void> {
  await navigateTo(`/courses/${coursePackId.value}`);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <AppButton
          size="sm"
          variant="ghost"
          @click="backToCoursePack"
        >
          返回课程包
        </AppButton>
        <span class="text-sm font-medium">{{ course?.title ?? "课程" }}</span>
        <span class="font-mono text-xs text-base-content/50">{{ courseId }}</span>
        <StatusBadge
          v-if="pack"
          :label="`课程包: ${pack.title}`"
          tone="info"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <AppButton
          size="sm"
          variant="outline"
          :loading="list.pending.value"
          @click="list.load"
        >
          刷新
        </AppButton>
        <AppButton
          size="sm"
          @click="openCreate"
        >
          新增语句
        </AppButton>
      </div>
    </div>

    <div
      v-if="detail.errorMessage.value"
      class="alert alert-warning text-xs"
    >
      课程包信息加载失败 ({{ detail.errorMessage.value }}), 语句列表仍可独立使用。
    </div>
    <div
      v-else-if="pack && !course"
      class="alert alert-warning text-xs"
    >
      该课程不在当前课程包的课程列表里 (可能已被删除), 请返回课程包重新选择。
    </div>
    <div
      v-if="pack && pack.status === 'archived'"
      class="alert alert-warning text-xs"
    >
      该课程包已归档: 后端会拒绝编辑其内容 (需先在课程包详情页恢复)。此处仍可查看语句。
    </div>

    <p class="text-xs text-base-content/60">
      数据来源: GET /admin/courses/{{ courseId }}/statements (服务端分页, 按 order 升序)。
      排序与编辑走同一条 PATCH /admin/statements/:statementId, 没有批量排序接口。
    </p>

    <div class="overflow-hidden rounded-box border border-base-300 bg-base-100">
      <AppLoading
        v-if="list.pending.value && statements.length === 0"
        label="正在加载语句"
      />
      <AppError
        v-else-if="list.errorMessage.value"
        title="语句列表加载失败"
        :message="list.errorMessage.value"
        :status-code="list.statusCode.value"
        :show-sign-in="list.unauthenticated.value"
        @retry="list.load"
        @sign-in="relogin"
      />
      <AppEmpty
        v-else-if="list.isEmpty.value"
        title="这门课程还没有语句"
        description="新增语句后可用 order 调整顺序; 音频类型需要填写音频地址与时间轴。"
      >
        <AppButton
          size="sm"
          class="mt-2"
          @click="openCreate"
        >
          新增语句
        </AppButton>
      </AppEmpty>
      <DataTable
        v-else
        :columns="COLUMNS"
      >
        <tr
          v-for="(statement, index) in statements"
          :key="statement.id"
          class="hover"
        >
          <td class="text-right text-xs tabular-nums">{{ statement.order }}</td>
          <td>
            <StatusBadge
              :label="presentStatementSourceType(statement.sourceType).label"
              :tone="presentStatementSourceType(statement.sourceType).tone"
            />
          </td>
          <td class="text-sm">
            <span class="block">{{ statement.chinese }}</span>
            <span class="block text-xs text-base-content/70">{{ statement.english }}</span>
          </td>
          <td class="text-xs text-base-content/70">{{ statement.soundmark || "—" }}</td>
          <td class="text-xs text-base-content/70">
            <span class="block break-all">{{ statement.audioUrl || "无音频" }}</span>
            <span class="block tabular-nums">
              {{ presentTimeline(statement.startMs, statement.endMs) }}
            </span>
          </td>
          <td>
            <div class="flex flex-wrap items-center justify-end gap-1">
              <AppButton
                size="sm"
                variant="ghost"
                :disabled="index === 0 || reorderingId === statement.id"
                @click="move(statement, -1)"
              >
                上移
              </AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                :disabled="index === statements.length - 1 || reorderingId === statement.id"
                @click="move(statement, 1)"
              >
                下移
              </AppButton>
              <AppButton
                size="sm"
                variant="outline"
                :disabled="reorderingId === statement.id"
                @click="openEdit(statement)"
              >
                编辑
              </AppButton>
              <AppButton
                size="sm"
                variant="danger"
                :disabled="reorderingId === statement.id"
                @click="askDelete(statement)"
              >
                删除
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

    <p class="text-xs text-base-content/50">
      共 {{ formatCount(list.total.value) }} 条语句 (服务端分页)。 上移/下移只交换相邻两条的 order,
      跨页调整请直接编辑 order。
    </p>

    <StatementFormModal
      v-model="formOpen"
      :mode="formMode"
      :statement="editingStatement"
      :submitting="submitting"
      @submit="onSubmitForm"
    />

    <AppConfirmDialog
      v-model="confirmOpen"
      title="删除语句"
      :message="confirmMessage"
      confirm-label="删除"
      tone="danger"
      :loading="confirmLoading"
      @confirm="runPendingAction"
    />
  </div>
</template>
