<script setup lang="ts">
import { computed, ref, watch } from "vue";

import StatusBadge from "~/components/status/StatusBadge.vue";
import AppInput from "~/components/form/AppInput.vue";
import AppButton from "~/components/ui/AppButton.vue";
import AppConfirmDialog from "~/components/ui/AppConfirmDialog.vue";
import AppEmpty from "~/components/ui/AppEmpty.vue";
import AppError from "~/components/ui/AppError.vue";
import AppLoading from "~/components/ui/AppLoading.vue";
import AppPagination from "~/components/ui/AppPagination.vue";
import { useAdminToast } from "~/composables/useAdminToast";
import { useAsyncResource } from "~/composables/useAsyncResource";
import { usePagedList } from "~/composables/usePagedList";
import { useRelogin } from "~/composables/useRelogin";
import { getErrorMessage } from "~/services/admin-api";
import { fetchBusinessSettings, updateBusinessSetting } from "~/services/businessSettings.service";
import type { AdminBusinessSetting } from "~/types/admin";
import {
  describeBusinessSetting,
  isEditableBusinessSetting,
  sortBusinessSettings,
} from "~/utils/businessSettings";
import { formatDateTime } from "~/utils/format";

/**
 * 业务设置 (GET /admin/business-settings、PATCH /admin/business-settings/:key)。
 *
 * 这里只编辑业务参数 (退款保护期 / 结算天数 / 是否开放推广 / 币种等), 参数列表以接口返回为准。
 * 安全边界: 系统级密钥与连接串 (DATABASE_URL / REDIS_URL / LOGTO_* / 支付私钥) 不属于业务参数,
 * 既不在该接口返回范围内, 后台也没有编辑入口 —— 即使将来有人把这类 key 写进表里,
 * 页面也按只读展示 (utils/businessSettings.ts 的 isEditableBusinessSetting 兜底)。
 */

const settings = useAsyncResource(fetchBusinessSettings, {
  isEmpty: (rows) => !Array.isArray(rows) || rows.length === 0,
});
const toast = useAdminToast();
const relogin = useRelogin();

const rows = computed<AdminBusinessSetting[]>(() =>
  sortBusinessSettings(settings.data.value ?? []),
);
const paged = usePagedList(rows, { pageSize: 10 });

/** 每个参数的编辑草稿 (以字符串保存, 与后端 value 的存储形式一致) */
const drafts = ref<Record<string, string>>({});
const rowErrors = ref<Record<string, string | null>>({});

watch(
  rows,
  (next) => {
    const nextDrafts: Record<string, string> = {};
    for (const row of next) nextDrafts[row.key] = row.value;
    drafts.value = nextDrafts;
    rowErrors.value = {};
  },
  { immediate: true },
);

const confirmOpen = ref(false);
const confirmLoading = ref(false);
const confirmMessage = ref("");
let pendingAction: (() => Promise<void>) | null = null;

const editableCount = computed(
  () => rows.value.filter((row) => isEditableBusinessSetting(row.key)).length,
);

function draftOf(key: string): string {
  return drafts.value[key] ?? "";
}

function setDraft(key: string, value: string): void {
  drafts.value = { ...drafts.value, [key]: value };
}

function errorOf(key: string): string | null {
  return rowErrors.value[key] ?? null;
}

function isDirty(row: AdminBusinessSetting): boolean {
  return draftOf(row.key) !== row.value;
}

function validate(key: string, value: string): string | null {
  if (!isEditableBusinessSetting(key)) return "系统级配置, 后台不可编辑";

  const spec = describeBusinessSetting(key);
  const trimmed = value.trim();

  if (spec.editor === "number") {
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return "请输入不小于 0 的数字";
    return null;
  }
  if (spec.editor === "boolean") {
    if (trimmed !== "true" && trimmed !== "false") return "只能选择开启或关闭";
    return null;
  }
  if (!trimmed) return "不能为空";
  if (key === "currency" && !/^[A-Za-z]{3}$/.test(trimmed)) {
    return "币种必须是三位字母代码 (例如 CNY)";
  }
  return null;
}

function askSave(row: AdminBusinessSetting): void {
  const value = draftOf(row.key);
  const error = validate(row.key, value);
  rowErrors.value = { ...rowErrors.value, [row.key]: error };
  if (error) return;
  if (value === row.value) {
    toast.info("没有需要保存的修改", `${row.key} 的值没有变化。`);
    return;
  }

  confirmMessage.value =
    `将业务参数 ${row.key} 由「${row.value}」修改为「${value.trim()}」。` +
    `该参数会影响线上业务行为 (退款保护期 / 佣金结算 / 推广开关等), 确认保存?`;
  pendingAction = async () => {
    await updateBusinessSetting(row.key, value.trim());
  };
  confirmOpen.value = true;
}

async function runPendingAction(): Promise<void> {
  if (!pendingAction || confirmLoading.value) return;
  confirmLoading.value = true;
  try {
    await pendingAction();
    await settings.refresh();
    toast.success("业务参数已更新");
  } catch (error) {
    toast.error("保存失败", getErrorMessage(error));
  } finally {
    confirmLoading.value = false;
    confirmOpen.value = false;
    pendingAction = null;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-col gap-1">
        <p class="text-xs text-base-content/60">
          数据来源: GET /admin/business-settings。参数列表与默认值以接口返回为准,
          前端不写死任何业务默认值。
        </p>
        <p class="text-xs font-medium text-warning">
          此处仅为业务参数, 系统密钥不在后台可编辑范围 (DATABASE_URL / REDIS_URL / LOGTO_* /
          支付私钥等一律不出现在本页, 也不可修改)。
        </p>
      </div>
      <AppButton
        size="sm"
        variant="outline"
        :loading="settings.pending.value"
        @click="settings.refresh"
      >
        刷新
      </AppButton>
    </div>

    <div class="overflow-hidden rounded-box border border-base-300 bg-base-100">
      <AppLoading
        v-if="settings.pending.value && !settings.data.value"
        label="正在加载业务参数"
      />
      <AppError
        v-else-if="settings.errorMessage.value"
        title="业务参数加载失败"
        :message="settings.errorMessage.value"
        :status-code="settings.statusCode.value"
        :show-sign-in="settings.unauthenticated.value"
        @retry="settings.refresh"
        @sign-in="relogin"
      />
      <AppEmpty
        v-else-if="settings.isEmpty.value"
        title="没有任何业务参数"
        description="后端 business_settings 表为空: 业务侧将使用代码内置默认值, 本页无可编辑项。"
      />
      <ul
        v-else
        class="divide-y divide-base-300"
      >
        <li
          v-for="row in paged.items.value"
          :key="row.key"
          class="flex flex-col gap-3 px-4 py-4"
          data-testid="business-setting-row"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex min-w-0 flex-col gap-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-xs text-base-content/70">{{ row.key }}</span>
                <StatusBadge
                  v-if="!isEditableBusinessSetting(row.key)"
                  label="系统级配置 (只读)"
                  tone="error"
                />
                <span
                  v-else
                  class="text-xs text-base-content/50"
                >
                  最近更新: {{ formatDateTime(row.updatedAt) }}
                </span>
              </div>
              <p class="max-w-2xl text-xs text-base-content/70">
                {{ describeBusinessSetting(row.key).description }}
                <span v-if="describeBusinessSetting(row.key).unit">
                  (单位: {{ describeBusinessSetting(row.key).unit }})
                </span>
              </p>
            </div>

            <div class="flex flex-wrap items-end gap-2">
              <template v-if="isEditableBusinessSetting(row.key)">
                <label
                  v-if="describeBusinessSetting(row.key).editor === 'boolean'"
                  class="form-control w-40"
                >
                  <span class="label pb-1 text-xs font-medium text-base-content/70">取值</span>
                  <select
                    class="select select-bordered select-sm w-full"
                    :value="draftOf(row.key)"
                    :aria-label="`${row.key} 取值`"
                    @change="setDraft(row.key, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="true">开启 (true)</option>
                    <option value="false">关闭 (false)</option>
                  </select>
                </label>
                <div
                  v-else
                  class="w-64"
                >
                  <AppInput
                    :model-value="draftOf(row.key)"
                    label="取值"
                    :error="errorOf(row.key)"
                    :hint="
                      describeBusinessSetting(row.key).editor === 'number'
                        ? '仅接受不小于 0 的数字'
                        : '以字符串提交给后端'
                    "
                    @update:model-value="setDraft(row.key, $event)"
                  />
                </div>
                <AppButton
                  size="sm"
                  :disabled="!isDirty(row)"
                  @click="askSave(row)"
                >
                  保存
                </AppButton>
              </template>
              <span
                v-else
                class="text-xs text-base-content/50"
              >
                当前值: {{ row.value }} (只读, 由部署环境管理)
              </span>
            </div>
          </div>
          <p
            v-if="isEditableBusinessSetting(row.key) && errorOf(row.key)"
            class="text-xs text-error"
          >
            {{ errorOf(row.key) }}
          </p>
        </li>
      </ul>
      <AppPagination
        v-if="!settings.pending.value && !settings.errorMessage.value && !settings.isEmpty.value"
        :page="paged.page.value"
        :total-pages="paged.totalPages.value"
        :total="paged.total.value"
        :page-size="paged.pageSize.value"
        @update:page="paged.setPage"
      />
    </div>

    <p class="text-xs text-base-content/50">
      共
      {{ editableCount }} 个业务参数可编辑。密钥、连接串、支付私钥等系统级配置只能由运维在部署环境
      (环境变量 / 密钥管理) 中变更, 管理后台不提供任何编辑或查看入口。
    </p>

    <AppConfirmDialog
      v-model="confirmOpen"
      title="确认修改业务参数"
      :message="confirmMessage"
      confirm-label="保存"
      tone="primary"
      :loading="confirmLoading"
      @confirm="runPendingAction"
    />
  </div>
</template>
