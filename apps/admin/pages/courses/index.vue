<script setup lang="ts">
import type { AdminCoursePackRow } from "~/types/admin";
import type { CoursePackFormSubmit, TableColumn } from "~/types/ui";

import { navigateTo } from "nuxt/app";
import { computed, ref } from "vue";

import AppInput from "~/components/form/AppInput.vue";
import CoursePackFormModal from "~/components/form/CoursePackFormModal.vue";
import StatusBadge from "~/components/status/StatusBadge.vue";
import DataTable from "~/components/table/DataTable.vue";
import AppButton from "~/components/ui/AppButton.vue";
import AppConfirmDialog from "~/components/ui/AppConfirmDialog.vue";
import AppEmpty from "~/components/ui/AppEmpty.vue";
import AppError from "~/components/ui/AppError.vue";
import AppLoading from "~/components/ui/AppLoading.vue";
import AppPagination from "~/components/ui/AppPagination.vue";
import { useAdminToast } from "~/composables/useAdminToast";
import { useCoursePackActions } from "~/composables/useCoursePackActions";
import { useRelogin } from "~/composables/useRelogin";
import { useServerPagedList } from "~/composables/useServerPagedList";
import { getErrorMessage } from "~/services/admin-api";
import { createCoursePack, fetchCoursePacksPage } from "~/services/courses.service";
import {
  COURSE_ACCESS_LEVEL_OPTIONS,
  COURSE_PACK_SOURCE_OPTIONS,
  COURSE_PACK_STATUS_OPTIONS,
  availableCoursePackActions,
  presentCourseAccessLevel,
  presentCoursePackSource,
  presentCoursePackStatus,
} from "~/utils/courseStatus";
import { formatCount, formatDateTime } from "~/utils/format";

/**
 * 课程中心 —— 课程包列表 (GET /admin/course-packs, 服务端分页)。
 *
 * 状态机规则 (硬约束): 页面**只调用**后端那 5 个状态端点, 不在前端自建第二套转换逻辑。
 * 这里只按当前状态显示可用按钮; 最终权威是后端 —— 后端拒绝时把错误原文展示出来,
 * 既不吞掉错误, 也不做乐观更新 (见 composables/useCoursePackActions.ts)。
 *
 * 后端缺口 (只报告, 本批次不改后端):
 *  - GET /admin/course-packs 没有 keyword 参数 → 关键词只在当前页内过滤, 页面已明确标注。
 * 课程包排序 (order) 不在这里改: 它是详情页「编辑课程包」表单的字段, 走同一条
 * PATCH /admin/course-packs/:id (@IsOptional @IsInt @Min(0))。
 */

const COLUMNS: TableColumn[] = [
  { key: "title", label: "标题" },
  { key: "status", label: "状态" },
  { key: "source", label: "来源" },
  { key: "accessLevel", label: "访问级别" },
  { key: "courseCount", label: "课程数", align: "right" },
  { key: "updatedAt", label: "更新时间" },
  { key: "actions", label: "操作", align: "right" },
];

const statusFilter = ref("");
const sourceFilter = ref("");
const accessLevelFilter = ref("");
const keyword = ref("");

const list = useServerPagedList<AdminCoursePackRow>((params) =>
  fetchCoursePacksPage({
    ...params,
    status: statusFilter.value || undefined,
    source: sourceFilter.value || undefined,
    accessLevel: accessLevelFilter.value || undefined,
  }),
);

const toast = useAdminToast();
const relogin = useRelogin();

/** 关键词只在当前页内过滤 (后端列表接口暂无 keyword 参数) */
const rows = computed<AdminCoursePackRow[]>(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return list.items.value;
  return list.items.value.filter(
    (row) => row.title.toLowerCase().includes(kw) || row.id.toLowerCase().includes(kw),
  );
});

const {
  confirmOpen,
  confirmLoading,
  confirmTitle,
  confirmMessage,
  confirmLabel,
  confirmTone,
  askStatusAction,
  askAccessLevel,
  askToggleFree,
  runPendingAction,
} = useCoursePackActions({ onSuccess: () => list.load() });

const formOpen = ref(false);
const submitting = ref(false);

function onFilterChange(): void {
  void list.reload();
}

function openCreate(): void {
  formOpen.value = true;
}

async function openDetail(row: AdminCoursePackRow): Promise<void> {
  await navigateTo(`/courses/${row.id}`);
}

async function openAiGenerator(): Promise<void> {
  await navigateTo("/courses/ai");
}

async function onCreatePack(submit: CoursePackFormSubmit): Promise<void> {
  if (submitting.value) return;
  submitting.value = true;
  try {
    const created = await createCoursePack({
      title: submit.payload.title,
      description: submit.payload.description,
      cover: submit.payload.cover,
      accessLevel: submit.payload.accessLevel,
    });
    toast.success(
      "课程包已创建",
      "新课程包为草稿 (draft) 且来源为手工创建, 需提交审核后才能发布。",
    );
    formOpen.value = false;
    // 直接进入详情页继续加课程/语句 (列表在下次进入时会重新拉取)
    if (created?.id) await navigateTo(`/courses/${created.id}`);
  } catch (error) {
    toast.error("创建失败", getErrorMessage(error));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-xs text-base-content/60">
        数据来源: GET /admin/course-packs (服务端分页 + status/source/accessLevel 过滤)。
        状态动作只调用后端既定端点, 后端拒绝时会原样显示原因。
      </p>
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
          variant="ghost"
          @click="openAiGenerator"
        >
          AI 生成草稿
        </AppButton>
        <AppButton
          size="sm"
          @click="openCreate"
        >
          新建课程包
        </AppButton>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <label class="form-control">
        <select
          v-model="statusFilter"
          class="select select-bordered select-sm"
          aria-label="状态过滤"
          @change="onFilterChange"
        >
          <option
            v-for="option in COURSE_PACK_STATUS_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="form-control">
        <select
          v-model="sourceFilter"
          class="select select-bordered select-sm"
          aria-label="来源过滤"
          @change="onFilterChange"
        >
          <option
            v-for="option in COURSE_PACK_SOURCE_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="form-control">
        <select
          v-model="accessLevelFilter"
          class="select select-bordered select-sm"
          aria-label="访问级别过滤"
          @change="onFilterChange"
        >
          <option
            v-for="option in COURSE_ACCESS_LEVEL_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>

      <div class="w-56">
        <AppInput
          v-model="keyword"
          placeholder="按标题 / ID 过滤当前页"
        />
      </div>
      <span class="text-xs text-base-content/50">
        关键词只过滤当前页 (后端接口暂无 keyword 参数)
      </span>
    </div>

    <div class="overflow-hidden rounded-box border border-base-300 bg-base-100">
      <AppLoading
        v-if="list.pending.value && list.items.value.length === 0"
        label="正在加载课程包"
      />
      <AppError
        v-else-if="list.errorMessage.value"
        title="课程包列表加载失败"
        :message="list.errorMessage.value"
        :status-code="list.statusCode.value"
        :show-sign-in="list.unauthenticated.value"
        @retry="list.load"
        @sign-in="relogin"
      />
      <AppEmpty
        v-else-if="list.isEmpty.value || rows.length === 0"
        title="没有匹配的课程包"
        :description="
          keyword.trim()
            ? '关键词在当前页没有匹配的课程包 (关键词只在当前页内过滤)。'
            : '换个筛选条件, 或新建一个课程包。'
        "
      >
        <AppButton
          size="sm"
          class="mt-2"
          @click="openCreate"
        >
          新建课程包
        </AppButton>
      </AppEmpty>
      <DataTable
        v-else
        :columns="COLUMNS"
      >
        <tr
          v-for="pack in rows"
          :key="pack.id"
          class="hover"
        >
          <td class="text-sm font-medium">
            {{ pack.title }}
            <span class="block font-mono text-xs text-base-content/40">{{ pack.id }}</span>
          </td>
          <td>
            <StatusBadge
              :label="presentCoursePackStatus(pack.status).label"
              :tone="presentCoursePackStatus(pack.status).tone"
            />
          </td>
          <td>
            <StatusBadge
              :label="presentCoursePackSource(pack.source).label"
              :tone="presentCoursePackSource(pack.source).tone"
            />
          </td>
          <td>
            <StatusBadge
              :label="presentCourseAccessLevel(pack.accessLevel, pack.isFree).label"
              :tone="presentCourseAccessLevel(pack.accessLevel, pack.isFree).tone"
            />
          </td>
          <td class="text-right text-sm tabular-nums">{{ formatCount(pack.courseCount) }}</td>
          <td class="text-xs text-base-content/60">{{ formatDateTime(pack.updatedAt) }}</td>
          <td>
            <div class="flex flex-wrap items-center justify-end gap-1">
              <AppButton
                size="sm"
                variant="outline"
                @click="openDetail(pack)"
              >
                详情
              </AppButton>
              <AppButton
                v-for="action in availableCoursePackActions(pack.status)"
                :key="action.key"
                size="sm"
                :variant="action.variant"
                @click="askStatusAction(pack, action.key)"
              >
                {{ action.label }}
              </AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                @click="askAccessLevel(pack)"
              >
                {{ pack.accessLevel === "free" ? "改为会员" : "改为免费" }}
              </AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                @click="askToggleFree(pack)"
              >
                免费/收费切换
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

    <CoursePackFormModal
      v-model="formOpen"
      mode="create"
      :submitting="submitting"
      @submit="onCreatePack"
    />

    <AppConfirmDialog
      v-model="confirmOpen"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirm-label="confirmLabel"
      :tone="confirmTone"
      :loading="confirmLoading"
      @confirm="runPendingAction"
    />
  </div>
</template>
