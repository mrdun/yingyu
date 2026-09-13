<script setup lang="ts">
import type {
  AdminCoursePackWritePayload,
  AdminCourseRow,
  AdminCourseWritePayload,
} from "~/types/admin";
import type { CourseFormSubmit, CoursePackFormSubmit, TableColumn } from "~/types/ui";

import { navigateTo } from "nuxt/app";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";

import CourseFormModal from "~/components/form/CourseFormModal.vue";
import CoursePackFormModal from "~/components/form/CoursePackFormModal.vue";
import StatusBadge from "~/components/status/StatusBadge.vue";
import DataTable from "~/components/table/DataTable.vue";
import AppButton from "~/components/ui/AppButton.vue";
import AppConfirmDialog from "~/components/ui/AppConfirmDialog.vue";
import AppEmpty from "~/components/ui/AppEmpty.vue";
import AppError from "~/components/ui/AppError.vue";
import AppLoading from "~/components/ui/AppLoading.vue";
import { useAdminToast } from "~/composables/useAdminToast";
import { useAsyncResource } from "~/composables/useAsyncResource";
import { useCoursePackActions } from "~/composables/useCoursePackActions";
import { useRelogin } from "~/composables/useRelogin";
import { getErrorMessage } from "~/services/admin-api";
import {
  createCourse,
  deleteCourse,
  fetchCoursePackDetail,
  updateCourse,
  updateCoursePack,
} from "~/services/courses.service";
import {
  availableCoursePackActions,
  presentCourseAccessLevel,
  presentCoursePackSource,
  presentCoursePackStatus,
} from "~/utils/courseStatus";
import { formatCount, formatDateTime } from "~/utils/format";
import { buildOrderSwapPayloads } from "~/utils/reorder";

/**
 * 课程中心 —— 课程包详情 (GET /admin/course-packs/:id, 不限状态)。
 *
 * 该接口是本批次新增的只读接口: 公开接口对 membership 包直接 403, 管理端没有它就读不到
 * 自己的草稿/待审/归档包。详情接口只返回课程元数据 (含 statementCount), 语句正文按课程分页读。
 *
 * 与列表页同一套状态机规则: 只调用后端既有端点, 后端拒绝时原样展示错误。
 * 课程排序复用 PATCH /admin/courses/:courseId {order} —— 没有新增任何批量排序接口。
 */

const COLUMNS: TableColumn[] = [
  { key: "order", label: "排序", align: "right" },
  { key: "title", label: "课程" },
  { key: "statementCount", label: "语句数", align: "right" },
  { key: "updatedAt", label: "更新时间" },
  { key: "actions", label: "操作", align: "right" },
];

const route = useRoute();
const coursePackId = computed(() => String(route.params.id ?? ""));

const detail = useAsyncResource(() => fetchCoursePackDetail(coursePackId.value));
const toast = useAdminToast();
const relogin = useRelogin();

const pack = computed(() => detail.data.value);
const courses = computed<AdminCourseRow[]>(() => detail.data.value?.courses ?? []);
const isAiGenerated = computed(() => pack.value?.source === "ai");

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
} = useCoursePackActions({ onSuccess: () => detail.refresh() });

/* --------------------------- 课程包属性编辑 --------------------------- */

const packFormOpen = ref(false);
const packSubmitting = ref(false);

async function onEditPack(submit: CoursePackFormSubmit): Promise<void> {
  if (packSubmitting.value) return;
  packSubmitting.value = true;
  try {
    // 只提交后端 DTO 认的字段 (title/description/cover/order; accessLevel 走独立入口, status 走状态机)
    const payload: AdminCoursePackWritePayload = {
      title: submit.payload.title,
      description: submit.payload.description,
      cover: submit.payload.cover,
    };
    if (submit.payload.order !== undefined) payload.order = submit.payload.order;
    await updateCoursePack(coursePackId.value, payload);
    toast.success("课程包已更新", "已保存标题 / 描述 / 封面 / 排序, 状态未变。");
    packFormOpen.value = false;
    await detail.refresh();
  } catch (error) {
    toast.error("保存失败", getErrorMessage(error));
  } finally {
    packSubmitting.value = false;
  }
}

/* ------------------------------ 课程增删改 ------------------------------ */

const courseFormOpen = ref(false);
const courseFormMode = ref<"create" | "edit">("create");
const editingCourse = ref<AdminCourseRow | null>(null);
const courseSubmitting = ref(false);

const courseConfirmOpen = ref(false);
const courseConfirmLoading = ref(false);
const courseConfirmMessage = ref("");
const reorderingId = ref<string | null>(null);
let pendingCourseAction: (() => Promise<void>) | null = null;

function openCreateCourse(): void {
  courseFormMode.value = "create";
  editingCourse.value = null;
  courseFormOpen.value = true;
}

function openEditCourse(course: AdminCourseRow): void {
  courseFormMode.value = "edit";
  editingCourse.value = course;
  courseFormOpen.value = true;
}

async function onCourseSubmit(submit: CourseFormSubmit): Promise<void> {
  if (courseSubmitting.value) return;
  courseSubmitting.value = true;
  try {
    const payload: AdminCourseWritePayload = {
      title: submit.payload.title,
      description: submit.payload.description,
      video: submit.payload.video,
    };
    if (submit.payload.order !== undefined) payload.order = submit.payload.order;

    if (submit.mode === "create") {
      await createCourse(coursePackId.value, { ...payload, title: submit.payload.title });
      toast.success("课程已新增");
    } else {
      await updateCourse(submit.courseId, payload);
      toast.success("课程已更新", "内容变更后课程包会退回草稿, 需重新审核发布 (后端规则)。");
    }
    courseFormOpen.value = false;
    await detail.refresh();
  } catch (error) {
    toast.error("保存失败", getErrorMessage(error));
  } finally {
    courseSubmitting.value = false;
  }
}

function askDeleteCourse(course: AdminCourseRow): void {
  courseConfirmMessage.value =
    `确认删除课程「${course.title}」? 该课程下的 ${course.statementCount} 条语句会一并删除, ` +
    `操作不可撤销。已发布 / 已归档的课程包后端会拒绝删除。`;
  pendingCourseAction = async () => {
    await deleteCourse(course.id);
  };
  courseConfirmOpen.value = true;
}

async function runPendingCourseAction(): Promise<void> {
  if (!pendingCourseAction || courseConfirmLoading.value) return;
  courseConfirmLoading.value = true;
  try {
    await pendingCourseAction();
    toast.success("课程已删除");
  } catch (error) {
    // 后端拒绝 (例如 published 包不允许删) → 原文展示
    toast.error("删除失败 (后端拒绝)", getErrorMessage(error));
  } finally {
    courseConfirmLoading.value = false;
    courseConfirmOpen.value = false;
    pendingCourseAction = null;
    await detail.refresh();
  }
}

/** 上移 / 下移: 只对相邻两条发既有 PATCH {order} */
async function moveCourse(course: AdminCourseRow, direction: -1 | 1): Promise<void> {
  const index = courses.value.findIndex((item) => item.id === course.id);
  const payloads = buildOrderSwapPayloads(courses.value, index, direction);
  if (!payloads) {
    toast.info(direction < 0 ? "已经是第一门课程" : "已经是最后一门课程");
    return;
  }

  reorderingId.value = course.id;
  try {
    for (const change of payloads) {
      await updateCourse(change.id, { order: change.order });
    }
    await detail.refresh();
    toast.success("排序已更新");
  } catch (error) {
    toast.error("排序失败", getErrorMessage(error));
  } finally {
    reorderingId.value = null;
  }
}

async function openStatements(course: AdminCourseRow): Promise<void> {
  await navigateTo(`/courses/${coursePackId.value}/courses/${course.id}`);
}

async function backToList(): Promise<void> {
  await navigateTo("/courses");
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <AppButton
          size="sm"
          variant="ghost"
          @click="backToList"
        >
          返回课程包列表
        </AppButton>
        <span class="font-mono text-xs text-base-content/50">{{ coursePackId }}</span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <AppButton
          size="sm"
          variant="outline"
          :loading="detail.pending.value"
          @click="detail.refresh"
        >
          刷新
        </AppButton>
        <AppButton
          size="sm"
          variant="outline"
          :disabled="!pack"
          @click="packFormOpen = true"
        >
          编辑课程包
        </AppButton>
      </div>
    </div>

    <div class="overflow-hidden rounded-box border border-base-300 bg-base-100">
      <AppLoading
        v-if="detail.pending.value && !pack"
        label="正在加载课程包详情"
      />
      <AppError
        v-else-if="detail.errorMessage.value"
        title="课程包详情加载失败"
        :message="detail.errorMessage.value"
        :status-code="detail.statusCode.value"
        :show-sign-in="detail.unauthenticated.value"
        @retry="detail.refresh"
        @sign-in="relogin"
      />
      <AppEmpty
        v-else-if="!pack"
        title="没有取到课程包"
        description="接口没有返回该课程包, 请返回列表重新选择。"
      />
      <div
        v-else
        class="flex flex-col gap-4 p-4"
      >
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-base font-semibold">{{ pack.title }}</h2>
          <StatusBadge
            :label="presentCoursePackStatus(pack.status).label"
            :tone="presentCoursePackStatus(pack.status).tone"
          />
          <StatusBadge
            :label="presentCoursePackSource(pack.source).label"
            :tone="presentCoursePackSource(pack.source).tone"
          />
          <StatusBadge
            :label="presentCourseAccessLevel(pack.accessLevel, pack.isFree).label"
            :tone="presentCourseAccessLevel(pack.accessLevel, pack.isFree).tone"
          />
        </div>

        <div
          v-if="isAiGenerated"
          class="alert alert-info text-xs"
          data-testid="ai-source-notice"
        >
          <div class="flex flex-col gap-1">
            <p class="font-medium">AI 生成，需审核后发布</p>
            <p>
              该课程包由 AI 生成 (source=ai)，后端固定写入草稿状态。必须走「提交审核 → 发布」
              流程才会对外可见；本页不提供任何跳过审核的快捷发布入口。
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
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

        <dl class="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">课程包 ID</dt>
            <dd class="break-all font-mono text-xs">{{ pack.id }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">排序 (order)</dt>
            <dd class="text-sm tabular-nums">
              {{ pack.order }}
              <span class="text-xs text-base-content/50">(用上方「编辑课程包」修改)</span>
            </dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">分享级别 (shareLevel)</dt>
            <dd class="text-sm">{{ pack.shareLevel }}</dd>
          </div>
          <div class="flex flex-col gap-0.5 md:col-span-2">
            <dt class="text-xs text-base-content/60">封面 (cover)</dt>
            <dd class="break-all text-xs">{{ pack.cover || "未设置" }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-base-content/60">更新时间</dt>
            <dd class="text-xs">{{ formatDateTime(pack.updatedAt) }}</dd>
          </div>
          <div class="flex flex-col gap-0.5 md:col-span-3">
            <dt class="text-xs text-base-content/60">描述</dt>
            <dd class="text-sm">{{ pack.description || "未填写" }}</dd>
          </div>
        </dl>
      </div>
    </div>

    <div class="overflow-hidden rounded-box border border-base-300 bg-base-100">
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-4 py-3"
      >
        <div>
          <p class="text-sm font-medium">课程列表</p>
          <p class="text-xs text-base-content/60">
            共 {{ courses.length }} 门课程 · 排序通过既有 PATCH /admin/courses/:courseId 写 order
            (没有批量排序接口)
          </p>
        </div>
        <AppButton
          size="sm"
          :disabled="!pack || pack.status === 'archived'"
          @click="openCreateCourse"
        >
          新增课程
        </AppButton>
      </div>

      <AppLoading
        v-if="detail.pending.value && !pack"
        label="正在加载课程"
      />
      <AppError
        v-else-if="detail.errorMessage.value"
        title="课程列表加载失败"
        :message="detail.errorMessage.value"
        :status-code="detail.statusCode.value"
        @retry="detail.refresh"
      />
      <AppEmpty
        v-else-if="courses.length === 0"
        title="该课程包还没有课程"
        description="先新增课程, 再进入语句编辑器逐句录入内容。"
      >
        <AppButton
          size="sm"
          class="mt-2"
          @click="openCreateCourse"
        >
          新增课程
        </AppButton>
      </AppEmpty>
      <DataTable
        v-else
        :columns="COLUMNS"
      >
        <tr
          v-for="(course, index) in courses"
          :key="course.id"
          class="hover"
        >
          <td class="text-right text-xs tabular-nums">{{ course.order }}</td>
          <td class="text-sm font-medium">
            {{ course.title }}
            <span class="block text-xs text-base-content/50">
              {{ course.description || "无描述" }}
            </span>
          </td>
          <td class="text-right text-sm tabular-nums">
            {{ formatCount(course.statementCount) }}
          </td>
          <td class="text-xs text-base-content/60">{{ formatDateTime(course.updatedAt) }}</td>
          <td>
            <div class="flex flex-wrap items-center justify-end gap-1">
              <AppButton
                size="sm"
                variant="ghost"
                :disabled="index === 0 || reorderingId === course.id"
                @click="moveCourse(course, -1)"
              >
                上移
              </AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                :disabled="index === courses.length - 1 || reorderingId === course.id"
                @click="moveCourse(course, 1)"
              >
                下移
              </AppButton>
              <AppButton
                size="sm"
                variant="outline"
                @click="openStatements(course)"
              >
                语句编辑
              </AppButton>
              <AppButton
                size="sm"
                variant="outline"
                :disabled="reorderingId === course.id"
                @click="openEditCourse(course)"
              >
                编辑
              </AppButton>
              <AppButton
                size="sm"
                variant="danger"
                :disabled="reorderingId === course.id"
                @click="askDeleteCourse(course)"
              >
                删除
              </AppButton>
            </div>
          </td>
        </tr>
      </DataTable>
    </div>

    <CoursePackFormModal
      v-model="packFormOpen"
      mode="edit"
      :pack="pack"
      :submitting="packSubmitting"
      @submit="onEditPack"
    />

    <CourseFormModal
      v-model="courseFormOpen"
      :mode="courseFormMode"
      :course="editingCourse"
      :submitting="courseSubmitting"
      @submit="onCourseSubmit"
    />

    <AppConfirmDialog
      v-model="courseConfirmOpen"
      title="删除课程"
      :message="courseConfirmMessage"
      confirm-label="删除"
      tone="danger"
      :loading="courseConfirmLoading"
      @confirm="runPendingCourseAction"
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
