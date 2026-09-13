<script setup lang="ts">
import type {
  AdminLearningPathDetail,
  AdminLearningPathItemRow,
  AdminLearningPathRow,
  CoursePackOption,
} from "~/types/admin";
import type { LearningPathFormSubmit, LearningPathItemFormSubmit, TableColumn } from "~/types/ui";

import { computed, ref } from "vue";

import LearningPathFormModal from "~/components/form/LearningPathFormModal.vue";
import LearningPathItemFormModal from "~/components/form/LearningPathItemFormModal.vue";
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
  addLearningPathItem,
  createLearningPath,
  deleteLearningPath,
  deleteLearningPathItem,
  fetchCoursePackOptions,
  fetchLearningPathDetail,
  fetchLearningPathsPage,
  setLearningPathPublished,
  updateLearningPath,
  updateLearningPathItem,
} from "~/services/learningPaths.service";
import { formatCount, formatDateTime } from "~/utils/format";
import {
  LEARNING_PATH_PUBLISHED_FILTER_OPTIONS,
  nextPathItemOrder,
  presentLearningPathPublished,
} from "~/utils/learningPath";
import { buildOrderSwapPayloads } from "~/utils/reorder";

/**
 * 学习路线 —— 编排「先学哪个课程包」的顺序 (阶段 → 课程包)。
 *
 * 数据来源 (9 个管理端接口, 全部 admin:access):
 *  - GET    /admin/learning-paths                列表 (含**未发布**) + 分页 + isPublished 过滤
 *  - GET    /admin/learning-paths/:id            详情 + 条目
 *  - POST   /admin/learning-paths                新建 (后端固定未发布)
 *  - PATCH  /admin/learning-paths/:id            编辑属性
 *  - PATCH  /admin/learning-paths/:id/publish    发布 / 下架 (二次确认, 幂等)
 *  - DELETE /admin/learning-paths/:id            删除 (二次确认, 后端连带删除条目)
 *  - POST   /admin/learning-paths/:id/items      添加条目 (重复课程包 → 后端 409, 原文展示)
 *  - PATCH  /admin/learning-path-items/:itemId   编辑条目 (阶段/排序)
 *  - DELETE /admin/learning-path-items/:itemId   删除条目 (二次确认)
 *
 * 排序: 上移 / 下移只对**相邻两条**发既有的单条 PATCH {order} —— 本批次没有新增
 * 任何批量排序接口 (见 utils/reorder.ts)。
 *
 * 本页只编排学习顺序: 不改课程包内容, 也不碰任何商业化字段。
 */

const PATH_COLUMNS: TableColumn[] = [
  { key: "order", label: "排序", align: "right" },
  { key: "title", label: "学习路线" },
  { key: "isPublished", label: "状态" },
  { key: "itemCount", label: "条目数", align: "right" },
  { key: "updatedAt", label: "更新时间" },
  { key: "actions", label: "操作", align: "right" },
];

const ITEM_COLUMNS: TableColumn[] = [
  { key: "order", label: "排序", align: "right" },
  { key: "stage", label: "阶段" },
  { key: "coursePack", label: "课程包" },
  { key: "actions", label: "操作", align: "right" },
];

const toast = useAdminToast();
const relogin = useRelogin();

/* ------------------------------- 路线列表 ------------------------------- */

const publishedFilter = ref("");

/** 下拉取值 → 后端 isPublished 参数 ("" / 非法值 = 不过滤, 管理端默认看全部含未发布) */
function filterToBoolean(value: string): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

const list = useServerPagedList<AdminLearningPathRow>((params) =>
  fetchLearningPathsPage({ ...params, isPublished: filterToBoolean(publishedFilter.value) }),
);

/** 条目编排用的课程包下拉 (复用课程包列表接口, 没有新增接口) */
const packOptions = useAsyncResource<CoursePackOption[]>(() => fetchCoursePackOptions());
const coursePackOptions = computed<CoursePackOption[]>(() => packOptions.data.value ?? []);

const pathFormOpen = ref(false);
const pathFormMode = ref<"create" | "edit">("create");
const editingPath = ref<AdminLearningPathRow | null>(null);
const pathSubmitting = ref(false);

/* --------------------------- 二次确认 (统一入口) --------------------------- */

const confirmOpen = ref(false);
const confirmLoading = ref(false);
const confirmTitle = ref("确认操作");
const confirmMessage = ref("");
const confirmLabel = ref("确认");
const confirmTone = ref<"danger" | "primary">("danger");

let pendingAction: (() => Promise<void>) | null = null;
let pendingSuccessMessage = "操作成功";

function askConfirm(input: {
  title: string;
  message: string;
  confirmLabel: string;
  tone: "danger" | "primary";
  successMessage: string;
  action: () => Promise<void>;
}): void {
  confirmTitle.value = input.title;
  confirmMessage.value = input.message;
  confirmLabel.value = input.confirmLabel;
  confirmTone.value = input.tone;
  pendingSuccessMessage = input.successMessage;
  pendingAction = input.action;
  confirmOpen.value = true;
}

/** 操作结束后 (无论成功失败) 都重新对齐后端数据: 不做乐观更新, 也不吞掉错误 */
async function refreshAll(): Promise<void> {
  await list.load();
  if (selectedPathId.value) await itemsDetail.load();
}

async function runPendingAction(): Promise<void> {
  if (!pendingAction || confirmLoading.value) return;
  confirmLoading.value = true;

  try {
    await pendingAction();
    toast.success(pendingSuccessMessage);
  } catch (error) {
    toast.error("操作未生效 (后端拒绝)", getErrorMessage(error));
  } finally {
    confirmLoading.value = false;
    confirmOpen.value = false;
    pendingAction = null;
    await refreshAll();
  }
}

/* ------------------------------ 路线增删改 ------------------------------ */

function onFilterChange(): void {
  void list.reload();
}

function openCreatePath(): void {
  pathFormMode.value = "create";
  editingPath.value = null;
  pathFormOpen.value = true;
}

function openEditPath(row: AdminLearningPathRow): void {
  pathFormMode.value = "edit";
  editingPath.value = row;
  pathFormOpen.value = true;
}

async function onSubmitPath(submit: LearningPathFormSubmit): Promise<void> {
  if (pathSubmitting.value) return;
  pathSubmitting.value = true;
  try {
    if (submit.mode === "create") {
      await createLearningPath(submit.payload);
      toast.success("学习路线已创建", "新路线为「未发布」, 编排好条目并发布后用户端才会看到。");
    } else {
      await updateLearningPath(submit.id, submit.payload);
      toast.success("学习路线已更新", "已保存标题 / 描述 / 封面 / 排序, 发布状态未变。");
    }
    pathFormOpen.value = false;
    await refreshAll();
  } catch (error) {
    toast.error("保存失败", getErrorMessage(error));
  } finally {
    pathSubmitting.value = false;
  }
}

/** 发布 / 下架 (二次确认; 端点幂等, 最终状态以后端返回为准) */
function askTogglePublish(row: AdminLearningPathRow): void {
  const goingLive = !row.isPublished;

  askConfirm({
    title: goingLive ? "发布学习路线" : "下架学习路线",
    message: goingLive
      ? `发布「${row.title}」? 发布后用户端的学习路线列表与详情即可看到这条路线 ` +
        `(当前 ${row.itemCount} 个条目)。发布前请确认条目顺序已编排好。`
      : `下架「${row.title}」? 下架后用户端不再展示这条路线, 条目与课程包本身都不会被删除, ` +
        `之后可以重新发布。`,
    confirmLabel: goingLive ? "发布" : "下架",
    tone: goingLive ? "primary" : "danger",
    successMessage: goingLive ? "学习路线已发布" : "学习路线已下架",
    action: async () => {
      await setLearningPathPublished(row.id, goingLive);
    },
  });
}

/** 删除路线: 强确认 —— 必须明确告知会连带删除条目 */
function askDeletePath(row: AdminLearningPathRow): void {
  askConfirm({
    title: "删除学习路线",
    message:
      `确认删除学习路线「${row.title}」? 该路线下的 ${row.itemCount} 个条目会被一并删除 ` +
      `(课程包本身不会被删除, 只是不再属于这条路线)。此操作不可撤销。`,
    confirmLabel: "删除路线",
    tone: "danger",
    successMessage: "学习路线已删除",
    action: async () => {
      await deleteLearningPath(row.id);
      // 正在编排的路线被删掉了 → 收起条目面板, 避免继续操作不存在的路线
      if (selectedPathId.value === row.id) selectedPathId.value = null;
    },
  });
}

/* ------------------------------ 条目编排 ------------------------------ */

const selectedPathId = ref<string | null>(null);
const itemsDetail = useAsyncResource<AdminLearningPathDetail>(
  () => fetchLearningPathDetail(String(selectedPathId.value)),
  { immediate: false },
);

const selectedPath = computed(() => itemsDetail.data.value);
const items = computed<AdminLearningPathItemRow[]>(() => itemsDetail.data.value?.items ?? []);
const reorderingId = ref<string | null>(null);

const itemFormOpen = ref(false);
const itemFormMode = ref<"create" | "edit">("create");
const editingItem = ref<AdminLearningPathItemRow | null>(null);
const itemSubmitting = ref(false);
/** 后端拒绝时的原文 (例如重复编排同一课程包的 409) */
const itemFormError = ref<string | null>(null);

async function openItems(row: AdminLearningPathRow): Promise<void> {
  selectedPathId.value = row.id;
  itemFormError.value = null;
  await itemsDetail.load();
}

function collapseItems(): void {
  selectedPathId.value = null;
  itemsDetail.data.value = null;
}

function openCreateItem(): void {
  itemFormMode.value = "create";
  editingItem.value = null;
  itemFormError.value = null;
  itemFormOpen.value = true;
}

function openEditItem(item: AdminLearningPathItemRow): void {
  itemFormMode.value = "edit";
  editingItem.value = item;
  itemFormError.value = null;
  itemFormOpen.value = true;
}

async function onSubmitItem(submit: LearningPathItemFormSubmit): Promise<void> {
  const pathId = selectedPathId.value;
  if (!pathId || itemSubmitting.value) return;

  itemSubmitting.value = true;
  itemFormError.value = null;

  try {
    if (submit.mode === "create") {
      await addLearningPathItem(pathId, submit.payload);
      toast.success("条目已添加");
    } else {
      await updateLearningPathItem(submit.itemId, submit.payload);
      toast.success("条目已更新");
    }
    itemFormOpen.value = false;
    await refreshAll();
  } catch (error) {
    // 后端拒绝 (重复课程包 → 409 / 参数非法 → 400): 原文展示在表单里,
    // 弹窗保持打开, 管理员可以直接改选课程包 —— 不翻译, 不吞掉, 也不当成"已保存"
    itemFormError.value = getErrorMessage(error);
  } finally {
    itemSubmitting.value = false;
  }
}

function askDeleteItem(item: AdminLearningPathItemRow): void {
  askConfirm({
    title: "删除条目",
    message:
      `确认从本路线删除条目「${item.stage || "未分组"} · ${item.coursePackTitle}」? ` +
      `只会移除这条编排关系, 课程包本身不会被删除。此操作不可撤销。`,
    confirmLabel: "删除条目",
    tone: "danger",
    successMessage: "条目已删除",
    action: async () => {
      await deleteLearningPathItem(item.id);
    },
  });
}

/**
 * 上移 / 下移: 只对相邻两条发既有 PATCH {order} (后端没有批量排序接口)。
 * 已经在首/末位时不发请求, 只提示 —— 不会写出 order=-1 这种被 DTO 拒绝的值。
 */
async function moveItem(item: AdminLearningPathItemRow, direction: -1 | 1): Promise<void> {
  const index = items.value.findIndex((row) => row.id === item.id);
  const payloads = buildOrderSwapPayloads(items.value, index, direction);

  if (!payloads) {
    toast.info(direction < 0 ? "已经是第一个条目" : "已经是最后一个条目");
    return;
  }

  reorderingId.value = item.id;
  try {
    for (const change of payloads) {
      await updateLearningPathItem(change.id, { order: change.order });
    }
    await refreshAll();
    toast.success("顺序已更新");
  } catch (error) {
    toast.error("排序失败", getErrorMessage(error));
  } finally {
    reorderingId.value = null;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-xs text-base-content/60">
        数据来源: GET /admin/learning-paths (服务端分页, 含未发布路线)。
        本页只编排「先学哪个课程包」的顺序, 不修改课程包内容; 用户端只看到已发布路线。
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
          @click="openCreatePath"
        >
          新建学习路线
        </AppButton>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <label class="form-control">
        <select
          v-model="publishedFilter"
          class="select select-bordered select-sm"
          aria-label="发布状态过滤"
          @change="onFilterChange"
        >
          <option
            v-for="option in LEARNING_PATH_PUBLISHED_FILTER_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <span class="text-xs text-base-content/50">
        状态徽章与过滤值都来自后端的 isPublished 字段
      </span>
    </div>

    <div class="overflow-hidden rounded-box border border-base-300 bg-base-100">
      <AppLoading
        v-if="list.pending.value && list.items.value.length === 0"
        label="正在加载学习路线"
      />
      <AppError
        v-else-if="list.errorMessage.value"
        title="学习路线列表加载失败"
        :message="list.errorMessage.value"
        :status-code="list.statusCode.value"
        :show-sign-in="list.unauthenticated.value"
        @retry="list.load"
        @sign-in="relogin"
      />
      <AppEmpty
        v-else-if="list.isEmpty.value"
        title="没有匹配的学习路线"
        description="换个发布状态过滤条件, 或新建一条学习路线。"
      >
        <AppButton
          size="sm"
          class="mt-2"
          @click="openCreatePath"
        >
          新建学习路线
        </AppButton>
      </AppEmpty>
      <DataTable
        v-else
        :columns="PATH_COLUMNS"
      >
        <tr
          v-for="row in list.items.value"
          :key="row.id"
          class="hover"
        >
          <td class="text-right text-xs tabular-nums">{{ row.order }}</td>
          <td class="text-sm font-medium">
            {{ row.title }}
            <span class="block text-xs text-base-content/50">
              {{ row.description || "未填写描述" }}
            </span>
            <span class="block font-mono text-xs text-base-content/40">{{ row.id }}</span>
          </td>
          <td>
            <StatusBadge
              :label="presentLearningPathPublished(row.isPublished).label"
              :tone="presentLearningPathPublished(row.isPublished).tone"
            />
          </td>
          <td class="text-right text-sm tabular-nums">{{ formatCount(row.itemCount) }}</td>
          <td class="text-xs text-base-content/60">{{ formatDateTime(row.updatedAt) }}</td>
          <td>
            <div class="flex flex-wrap items-center justify-end gap-1">
              <AppButton
                size="sm"
                variant="outline"
                @click="openItems(row)"
              >
                条目编排
              </AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                @click="openEditPath(row)"
              >
                编辑
              </AppButton>
              <AppButton
                size="sm"
                :variant="row.isPublished ? 'ghost' : 'primary'"
                @click="askTogglePublish(row)"
              >
                {{ row.isPublished ? "下架" : "发布" }}
              </AppButton>
              <AppButton
                size="sm"
                variant="danger"
                @click="askDeletePath(row)"
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

    <div
      v-if="selectedPathId"
      class="overflow-hidden rounded-box border border-base-300 bg-base-100"
      data-testid="learning-path-items-panel"
    >
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-4 py-3"
      >
        <div>
          <p class="text-sm font-medium">
            条目编排
            <span class="text-xs font-normal text-base-content/60">
              {{ selectedPath ? `· ${selectedPath.title}` : "" }}
            </span>
          </p>
          <p class="text-xs text-base-content/60">
            共 {{ items.length }} 个条目 · 上移/下移只对相邻两条发既有 PATCH (没有批量排序接口) ·
            同一个课程包在同一条路线里只能出现一次
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <AppButton
            size="sm"
            variant="outline"
            :loading="itemsDetail.pending.value"
            @click="itemsDetail.load"
          >
            刷新条目
          </AppButton>
          <AppButton
            size="sm"
            :disabled="!selectedPath"
            @click="openCreateItem"
          >
            添加条目
          </AppButton>
          <AppButton
            size="sm"
            variant="ghost"
            @click="collapseItems"
          >
            收起
          </AppButton>
        </div>
      </div>

      <div
        v-if="packOptions.errorMessage.value"
        class="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 bg-warning/10 px-4 py-2 text-xs text-base-content/80"
        data-testid="course-pack-options-error"
      >
        <span
          >课程包下拉加载失败 (添加/编辑条目时选不到课程包):
          {{ packOptions.errorMessage.value }}</span
        >
        <AppButton
          size="sm"
          variant="ghost"
          :loading="packOptions.pending.value"
          @click="packOptions.load"
        >
          重试
        </AppButton>
      </div>

      <AppLoading
        v-if="itemsDetail.pending.value && !selectedPath"
        label="正在加载路线条目"
      />
      <AppError
        v-else-if="itemsDetail.errorMessage.value"
        title="路线条目加载失败"
        :message="itemsDetail.errorMessage.value"
        :status-code="itemsDetail.statusCode.value"
        :show-sign-in="itemsDetail.unauthenticated.value"
        @retry="itemsDetail.load"
        @sign-in="relogin"
      />
      <AppEmpty
        v-else-if="items.length === 0"
        title="这条路线还没有条目"
        description="添加课程包并设置阶段与顺序, 就是用户看到的学习顺序。"
      >
        <AppButton
          size="sm"
          class="mt-2"
          @click="openCreateItem"
        >
          添加条目
        </AppButton>
      </AppEmpty>
      <DataTable
        v-else
        :columns="ITEM_COLUMNS"
      >
        <tr
          v-for="(item, index) in items"
          :key="item.id"
          class="hover"
        >
          <td class="text-right text-xs tabular-nums">{{ item.order }}</td>
          <td class="text-sm">{{ item.stage || "未分组" }}</td>
          <td class="text-sm">
            {{ item.coursePackTitle }}
            <span class="block font-mono text-xs text-base-content/40">{{
              item.coursePackId
            }}</span>
          </td>
          <td>
            <div class="flex flex-wrap items-center justify-end gap-1">
              <AppButton
                size="sm"
                variant="ghost"
                :disabled="index === 0 || reorderingId === item.id"
                @click="moveItem(item, -1)"
              >
                上移
              </AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                :disabled="index === items.length - 1 || reorderingId === item.id"
                @click="moveItem(item, 1)"
              >
                下移
              </AppButton>
              <AppButton
                size="sm"
                variant="outline"
                :disabled="reorderingId === item.id"
                @click="openEditItem(item)"
              >
                编辑
              </AppButton>
              <AppButton
                size="sm"
                variant="danger"
                :disabled="reorderingId === item.id"
                @click="askDeleteItem(item)"
              >
                删除
              </AppButton>
            </div>
          </td>
        </tr>
      </DataTable>
    </div>

    <LearningPathFormModal
      v-model="pathFormOpen"
      :mode="pathFormMode"
      :path="editingPath"
      :submitting="pathSubmitting"
      @submit="onSubmitPath"
    />

    <LearningPathItemFormModal
      v-model="itemFormOpen"
      :mode="itemFormMode"
      :item="editingItem"
      :course-pack-options="coursePackOptions"
      :options-pending="packOptions.pending.value"
      :error="itemFormError"
      :default-order="nextPathItemOrder(items)"
      :submitting="itemSubmitting"
      @submit="onSubmitItem"
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
