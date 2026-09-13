<script setup lang="ts">
import { computed } from "vue";

import StatusBadge from "~/components/status/StatusBadge.vue";
import AppButton from "~/components/ui/AppButton.vue";
import AppError from "~/components/ui/AppError.vue";
import AppLoading from "~/components/ui/AppLoading.vue";
import StatCard from "~/components/ui/StatCard.vue";
import { useAdminToast } from "~/composables/useAdminToast";
import { useAsyncResource } from "~/composables/useAsyncResource";
import { useRelogin } from "~/composables/useRelogin";
import { fetchSystemHealth } from "~/services/system.service";
import type { DependencyState } from "~/types/admin";
import { MISSING_TEXT, formatCount, formatDateTime } from "~/utils/format";
import { presentDependencyState, presentHealthStatus } from "~/utils/status";

/**
 * 系统健康 (GET /health, 后端无鉴权)。
 *
 * 只展示 database / redis / logto 三个依赖的状态与整体 status (ok/degraded/fail)。
 * 后端会在 503 时返回完整报告 —— services/system.service.ts 已把 503 的报告体取出来,
 * 所以"数据库挂了"这种情况在页面上依然可见, 而不是变成一句笼统的加载失败。
 *
 * 安全约束: 不渲染 report.details (可能包含数据库/缓存连接串等内部信息)。
 */

const health = useAsyncResource(fetchSystemHealth);
const toast = useAdminToast();
const relogin = useRelogin();

const report = computed(() => health.data.value);

const dependencies = computed(() => {
  const checks = report.value?.checks;
  if (!checks) return [];
  return [
    { key: "database", label: "数据库 database", state: checks.database },
    { key: "redis", label: "缓存 redis", state: checks.redis },
    { key: "logto", label: "认证 logto", state: checks.logto },
  ] as Array<{ key: string; label: string; state: DependencyState }>;
});

const overall = computed(() => presentHealthStatus(report.value?.status));

async function refresh(): Promise<void> {
  const before = report.value?.status;
  await health.refresh();
  const after = report.value?.status;
  if (before && after && before !== after) {
    toast.warning("健康状态发生变化", `${before} → ${after}`);
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <StatusBadge
          v-if="report"
          :label="overall.label"
          :tone="overall.tone"
          size="md"
        />
        <span class="text-xs text-base-content/60">
          数据来源: GET /health (无鉴权)。details 字段可能含内部连接信息, 本页不展示。
        </span>
      </div>
      <AppButton
        size="sm"
        variant="outline"
        :loading="health.pending.value"
        @click="refresh"
      >
        刷新
      </AppButton>
    </div>

    <div class="overflow-hidden rounded-box border border-base-300 bg-base-100">
      <AppLoading
        v-if="health.pending.value && !report"
        label="正在检查系统健康"
      />
      <AppError
        v-else-if="health.errorMessage.value"
        title="健康检查失败"
        :message="health.errorMessage.value"
        :status-code="health.statusCode.value"
        :show-sign-in="health.unauthenticated.value"
        @retry="health.refresh"
        @sign-in="relogin"
      />
      <div
        v-else
        class="flex flex-col gap-4 px-4 py-4"
      >
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="整体状态"
            :value="overall.label"
            hint="status"
          />
          <StatCard
            label="版本"
            :value="report?.version ?? MISSING_TEXT"
            hint="RELEASE_VERSION"
          />
          <StatCard
            label="运行环境"
            :value="report?.env ?? MISSING_TEXT"
            hint="NODE_ENV"
          />
          <StatCard
            label="检查时间"
            :value="formatDateTime(report?.timestamp)"
          />
        </div>

        <div>
          <h2 class="mb-2 text-sm font-semibold">依赖状态</h2>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div
              v-for="dependency in dependencies"
              :key="dependency.key"
              class="flex items-center justify-between rounded-box border border-base-300 px-4 py-3"
              data-testid="health-dependency"
            >
              <div class="flex flex-col">
                <span class="text-sm font-medium">{{ dependency.label }}</span>
                <span class="text-xs text-base-content/50">
                  {{ dependency.state }}
                </span>
              </div>
              <StatusBadge
                :label="presentDependencyState(dependency.state).label"
                :tone="presentDependencyState(dependency.state).tone"
              />
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs text-base-content/60">
          <span>数据库异常时后端返回 503, 本页仍会展示报告内容。</span>
          <span
            v-if="report?.details"
            class="text-warning"
          >
            后端返回了 {{ formatCount(Object.keys(report.details).length) }} 条错误详情
            (已按安全策略隐藏)
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
