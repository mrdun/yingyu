<script setup lang="ts">
import { computed, ref } from "vue";

import StatusBadge from "~/components/status/StatusBadge.vue";
import AppButton from "~/components/ui/AppButton.vue";
import AppConfirmDialog from "~/components/ui/AppConfirmDialog.vue";
import AppEmpty from "~/components/ui/AppEmpty.vue";
import AppError from "~/components/ui/AppError.vue";
import AppLoading from "~/components/ui/AppLoading.vue";
import AppPagination from "~/components/ui/AppPagination.vue";
import AppSwitch from "~/components/form/AppSwitch.vue";
import { useAdminToast } from "~/composables/useAdminToast";
import { useAsyncResource } from "~/composables/useAsyncResource";
import { usePagedList } from "~/composables/usePagedList";
import { useRelogin } from "~/composables/useRelogin";
import { getErrorMessage } from "~/services/admin-api";
import {
  describeProvider,
  fetchPaymentChannels,
  updatePaymentChannel,
} from "~/services/paymentChannels.service";
import type { AdminPaymentChannel } from "~/types/admin";
import { presentChannelReadiness, presentConfigured, presentEnabled } from "~/utils/status";

/**
 * 支付渠道开关 (GET /admin/payment-channels, PATCH /admin/payment-channels/:provider)。
 *
 * 安全约束: 后端只返回 enabled / configured / 支持方式, 本页也只展示这些布尔与文案,
 * **绝不展示任何商户密钥、证书或回调地址内容**。
 * 开关直接影响用户能否付款, 因此两个方向都做二次确认。
 */

const channels = useAsyncResource(fetchPaymentChannels, {
  isEmpty: (rows) => rows.length === 0,
});
const toast = useAdminToast();
const relogin = useRelogin();

const rows = computed<AdminPaymentChannel[]>(() => channels.data.value ?? []);
const paged = usePagedList(rows, { pageSize: 10 });

const busyProvider = ref<string | null>(null);

const confirmOpen = ref(false);
const confirmLoading = ref(false);
const confirmTitle = ref("确认操作");
const confirmMessage = ref("");
const confirmLabel = ref("确认");
const confirmTone = ref<"danger" | "primary">("danger");
let pendingAction: (() => Promise<void>) | null = null;

function methodLabel(method: { label: string; qr: boolean }): string {
  return method.qr ? `${method.label} (扫码)` : `${method.label} (跳转)`;
}

async function applyEnabled(channel: AdminPaymentChannel, enabled: boolean): Promise<void> {
  busyProvider.value = channel.provider;
  try {
    await updatePaymentChannel(channel.provider, enabled);
    await channels.refresh();
    toast.success(`${describeProvider(channel.provider)} 已${enabled ? "启用" : "停用"}`);
  } catch (error) {
    toast.error("渠道更新失败", getErrorMessage(error));
  } finally {
    busyProvider.value = null;
  }
}

function askToggle(channel: AdminPaymentChannel, enabled: boolean): void {
  const label = describeProvider(channel.provider);
  const missingCredential = enabled && channel.configured === false;

  confirmTitle.value = enabled ? `启用 ${label}` : `停用 ${label}`;
  confirmMessage.value = enabled
    ? missingCredential
      ? `${label} 当前缺少环境变量凭据 (configured=false)。启用后用户下单可能直接失败, 确认仍然启用?`
      : `启用后用户可以选择 ${label} 付款。确认启用?`
    : `停用后用户将无法使用 ${label} 付款 (已下单的订单不受影响)。确认停用?`;
  confirmLabel.value = enabled ? "启用" : "停用";
  confirmTone.value = enabled ? "primary" : "danger";

  pendingAction = () => applyEnabled(channel, enabled);
  confirmOpen.value = true;
}

async function runPendingAction(): Promise<void> {
  if (!pendingAction || confirmLoading.value) return;
  confirmLoading.value = true;
  try {
    await pendingAction();
  } finally {
    confirmLoading.value = false;
    confirmOpen.value = false;
    pendingAction = null;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-base-content/60">
        数据来源: GET /admin/payment-channels。本页不展示任何密钥或证书内容 (后端也不返回)。
      </p>
      <AppButton
        size="sm"
        variant="outline"
        :loading="channels.pending.value"
        @click="channels.refresh"
      >
        刷新
      </AppButton>
    </div>

    <div class="overflow-hidden rounded-box border border-base-300 bg-base-100">
      <AppLoading
        v-if="channels.pending.value && !channels.data.value"
        label="正在加载支付渠道"
      />
      <AppError
        v-else-if="channels.errorMessage.value"
        title="支付渠道加载失败"
        :message="channels.errorMessage.value"
        :status-code="channels.statusCode.value"
        :show-sign-in="channels.unauthenticated.value"
        @retry="channels.refresh"
        @sign-in="relogin"
      />
      <AppEmpty
        v-else-if="channels.isEmpty.value"
        title="没有可管理的支付渠道"
        description="后端未注册任何支付渠道 provider。"
      />
      <ul
        v-else
        class="divide-y divide-base-300"
      >
        <li
          v-for="channel in paged.items.value"
          :key="channel.provider"
          class="flex flex-wrap items-start justify-between gap-4 px-4 py-4"
          data-testid="payment-channel-row"
        >
          <div class="flex min-w-0 flex-col gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold">{{ describeProvider(channel.provider) }}</span>
              <span class="font-mono text-xs text-base-content/50">{{ channel.provider }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <StatusBadge
                :label="presentEnabled(channel.enabled).label"
                :tone="presentEnabled(channel.enabled).tone"
              />
              <StatusBadge
                :label="presentConfigured(channel.configured).label"
                :tone="presentConfigured(channel.configured).tone"
              />
              <StatusBadge
                :label="presentChannelReadiness(channel.enabled, channel.configured).label"
                :tone="presentChannelReadiness(channel.enabled, channel.configured).tone"
              />
            </div>
            <div class="flex flex-wrap items-center gap-2 text-xs text-base-content/60">
              <span>支持方式:</span>
              <span
                v-if="channel.methods.length === 0"
                class="text-base-content/40"
              >
                暂无
              </span>
              <span
                v-for="method in channel.methods"
                :key="method.method"
                class="badge badge-outline badge-sm"
              >
                {{ methodLabel(method) }}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <span
              v-if="channel.enabled && channel.configured === false"
              class="text-xs text-error"
            >
              缺少凭据
            </span>
            <AppSwitch
              :model-value="channel.enabled"
              :loading="busyProvider === channel.provider"
              :label="channel.enabled ? '已启用' : '已停用'"
              @update:model-value="askToggle(channel, $event)"
            />
          </div>
        </li>
      </ul>
      <AppPagination
        v-if="!channels.pending.value && !channels.errorMessage.value && !channels.isEmpty.value"
        :page="paged.page.value"
        :total-pages="paged.totalPages.value"
        :total="paged.total.value"
        :page-size="paged.pageSize.value"
        @update:page="paged.setPage"
      />
    </div>

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
