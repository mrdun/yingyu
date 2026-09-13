<script setup lang="ts">
import { definePageMeta } from "#imports";
import { useHandleSignInCallback } from "@logto/vue";
import { navigateTo } from "nuxt/app";
import { watch, ref } from "vue";

import AppButton from "~/components/ui/AppButton.vue";
import AppLoading from "~/components/ui/AppLoading.vue";
import { getSignInCallback, signIn } from "~/services/auth";

/**
 * Logto 登录回调页 (/callback, 已在 Logto 注册)。
 * 必须在守卫的公开路径里: 这一页本身就是用来完成登录的, 不能再被要求先登录。
 */
definePageMeta({ layout: false });

const errorMessage = ref<string | null>(null);

const { isLoading, error } = useHandleSignInCallback(async () => {
  // 回到登录前想去的页面 (默认 /dashboard)
  await navigateTo(getSignInCallback(), { replace: true });
});

watch(error, (value) => {
  if (value) errorMessage.value = String(value);
});

function retry(): void {
  errorMessage.value = null;
  signIn("/dashboard");
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-base-200 p-6">
    <div
      class="w-full max-w-md rounded-box border border-base-300 bg-base-100 p-6 text-center shadow-soft"
    >
      <template v-if="!errorMessage">
        <AppLoading :label="isLoading ? '正在完成登录' : '登录完成, 正在跳转'" />
      </template>
      <template v-else>
        <h1 class="text-sm font-semibold text-error">登录失败</h1>
        <p class="mt-2 break-words text-xs text-base-content/70">{{ errorMessage }}</p>
        <div class="mt-4 flex justify-center">
          <AppButton
            size="sm"
            @click="retry"
          >
            重新登录
          </AppButton>
        </div>
      </template>
    </div>
  </div>
</template>
