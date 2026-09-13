<script setup lang="ts">
import AppButton from "~/components/ui/AppButton.vue";

const props = withDefaults(
  defineProps<{
    title?: string;
    message?: string | null;
    /** 保留 HTTP 状态码, 便于一眼区分 401 / 403 / 5xx */
    statusCode?: number | undefined;
    showRetry?: boolean;
    /** 401: 提供"重新登录"入口 */
    showSignIn?: boolean;
  }>(),
  {
    title: "加载失败",
    message: null,
    statusCode: undefined,
    showRetry: true,
    showSignIn: false,
  },
);

const emit = defineEmits<{ retry: []; signIn: [] }>();
</script>

<template>
  <div
    class="flex flex-col items-center justify-center gap-3 py-10 text-center"
    data-testid="app-error"
  >
    <div class="flex items-center gap-2">
      <span class="text-sm font-semibold text-error">{{ props.title }}</span>
      <span
        v-if="props.statusCode"
        class="badge badge-outline badge-sm"
      >
        HTTP {{ props.statusCode }}
      </span>
    </div>
    <p
      v-if="props.message"
      class="max-w-lg text-xs text-base-content/70"
    >
      {{ props.message }}
    </p>
    <div class="flex items-center gap-2">
      <AppButton
        v-if="props.showSignIn"
        size="sm"
        @click="emit('signIn')"
      >
        重新登录
      </AppButton>
      <AppButton
        v-if="props.showRetry"
        size="sm"
        variant="outline"
        @click="emit('retry')"
      >
        重试
      </AppButton>
    </div>
  </div>
</template>
