<script setup lang="ts">
import { computed } from "vue";

import StatusBadge from "~/components/status/StatusBadge.vue";
import AppButton from "~/components/ui/AppButton.vue";
import { useAdminSession } from "~/composables/useAdminSession";

const props = defineProps<{
  title: string;
  breadcrumb: string[];
}>();

const emit = defineEmits<{ "toggle-sidebar": [] }>();

const session = useAdminSession();
const adminLabel = computed(() => session.displayName.value ?? "未知管理员");
</script>

<template>
  <header
    class="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-base-300 bg-base-100/95 px-4 backdrop-blur"
    data-testid="app-topbar"
  >
    <AppButton
      size="sm"
      variant="ghost"
      class="md:hidden"
      aria-label="切换导航"
      @click="emit('toggle-sidebar')"
    >
      菜单
    </AppButton>

    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-1 text-xs text-base-content/60">
        <template
          v-for="(crumb, index) in props.breadcrumb"
          :key="crumb"
        >
          <span
            v-if="index > 0"
            class="px-1"
          >
            /
          </span>
          <span :class="index === props.breadcrumb.length - 1 ? 'text-base-content/80' : ''">
            {{ crumb }}
          </span>
        </template>
      </div>
      <h1 class="truncate text-sm font-semibold">{{ props.title }}</h1>
    </div>

    <div class="flex items-center gap-2">
      <!-- 只展示当前 Logto 账号, 不代表权限; 权限由后端 admin:access 判定 -->
      <StatusBadge
        :label="adminLabel"
        tone="info"
      />
    </div>
  </header>
</template>
