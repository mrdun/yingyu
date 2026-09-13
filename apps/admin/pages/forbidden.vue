<script setup lang="ts">
import { definePageMeta } from "#imports";
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";

import StatusBadge from "~/components/status/StatusBadge.vue";
import AppButton from "~/components/ui/AppButton.vue";
import { useAdminAccess } from "~/composables/useAdminAccess";
import { useAdminSession } from "~/composables/useAdminSession";
import { signIn, signOut } from "~/services/auth";

/**
 * Forbidden (403) 页面。
 *
 * 关键区分: 这里代表"已登录但没有管理后台权限", 与"未登录"是两回事 ——
 * 未登录会被守卫直接送去做 Logto 登录; 只有拿到 403 才会落到这一页。
 * 本页必须在守卫的公开路径里, 否则会自己把自己再判一次, 形成无限重定向。
 */
definePageMeta({ layout: false });

const route = useRoute();
const router = useRouter();
const access = useAdminAccess();
const session = useAdminSession();

const isSessionIssue = computed(() => String(route.query.reason ?? "") === "session");

const accountLabel = computed(() => session.displayName.value ?? "未获取到管理员信息");
const accountDetail = computed(() => session.identity.value?.subject ?? "");

const reasonText = computed(() => {
  if (isSessionIssue.value) {
    return "后端反复返回 401 (会话无法建立)。这通常说明 Logto 令牌的 audience/issuer 与后端配置不一致, 需要运维检查配置, 而不是重复登录。";
  }
  return access.message.value ?? "当前账号缺少 admin:access 权限。";
});

onMounted(() => {
  void session.load();
});

function retryLogin(): void {
  signIn("/dashboard");
}

function goDashboard(): void {
  void router.push("/dashboard");
}

function logout(): void {
  session.reset();
  signOut();
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-base-200 p-6">
    <div class="w-full max-w-xl rounded-box border border-base-300 bg-base-100 p-6 shadow-soft">
      <div class="flex items-center gap-2">
        <StatusBadge
          label="403 Forbidden"
          tone="warning"
          size="md"
        />
        <h1 class="text-base font-semibold">你没有管理后台权限</h1>
      </div>

      <p class="mt-3 text-sm text-base-content/80">
        你已成功登录, 但当前账号不具备
        <span class="font-mono text-xs">admin:access</span>
        权限。前端权限只是体验层, 后端仍会对每个管理接口做鉴权。
      </p>
      <p class="mt-2 text-xs text-base-content/60">{{ reasonText }}</p>

      <dl class="mt-4 grid grid-cols-1 gap-2 rounded-box bg-base-200 px-4 py-3 text-xs">
        <div class="flex items-center justify-between gap-4">
          <dt class="text-base-content/60">当前账号</dt>
          <dd class="truncate font-medium">{{ accountLabel }}</dd>
        </div>
        <div
          v-if="accountDetail"
          class="flex items-center justify-between gap-4"
        >
          <dt class="text-base-content/60">Logto sub</dt>
          <dd class="truncate font-mono">{{ accountDetail }}</dd>
        </div>
      </dl>

      <div class="mt-5 flex flex-wrap items-center gap-2">
        <AppButton
          v-if="access.isGranted.value"
          size="sm"
          @click="goDashboard"
        >
          返回 Dashboard
        </AppButton>
        <AppButton
          size="sm"
          variant="outline"
          @click="retryLogin"
        >
          换账号登录
        </AppButton>
        <AppButton
          size="sm"
          variant="ghost"
          @click="logout"
        >
          退出登录
        </AppButton>
      </div>
    </div>
  </div>
</template>
