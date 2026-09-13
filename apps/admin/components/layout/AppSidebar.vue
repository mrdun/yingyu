<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import AppButton from "~/components/ui/AppButton.vue";
import { useAdminSession } from "~/composables/useAdminSession";
import { useAdminToast } from "~/composables/useAdminToast";
import { signOut } from "~/services/auth";
import type { NavItem } from "~/utils/nav";
import { NAV_ITEMS, normalizePath } from "~/utils/nav";

/**
 * 左侧导航。
 * O-04 批次后 13 项全部可用 (O-01 的 4 项 + O-02 的 7 项业务模块 + O-03 的课程中心 +
 * O-04 的学习路线), 零占位。
 * 占位分支 (v-else, data-testid="nav-placeholder") 保留给将来的新模块: 未实现时
 * 显示为禁用项并提示"后续批次", 而不是把菜单藏起来假装模块不存在。
 */
const props = withDefaults(defineProps<{ open?: boolean }>(), { open: false });
const emit = defineEmits<{ close: [] }>();

const route = useRoute();
const toast = useAdminToast();
const session = useAdminSession();

const activePath = computed(() => normalizePath(String(route.path)));
const adminLabel = computed(() => session.displayName.value ?? "未获取到管理员信息");
const adminDetail = computed(() => {
  const identity = session.identity.value;
  if (!identity) return session.pending.value ? "加载中" : "—";
  return identity.email ?? identity.subject ?? "—";
});

function isActive(item: NavItem): boolean {
  if (item.to === null) return false;
  const base = normalizePath(item.to);
  // 子路由 (例如 /courses/:id) 也属于该模块, 否则详情页不点亮任何菜单项
  return activePath.value === base || activePath.value.startsWith(`${base}/`);
}

function onPlaceholderClick(item: NavItem): void {
  toast.placeholder(item.label);
}

function onSignOut(): void {
  session.reset();
  signOut();
}
</script>

<template>
  <div
    v-if="props.open"
    class="fixed inset-0 z-30 bg-black/30 md:hidden"
    aria-hidden="true"
    @click="emit('close')"
  ></div>

  <aside
    class="fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-base-300 bg-base-100 transition-transform md:static md:translate-x-0"
    :class="props.open ? 'translate-x-0' : '-translate-x-full'"
    data-testid="app-sidebar"
  >
    <div class="flex h-14 items-center gap-2 border-b border-base-300 px-4">
      <span class="text-sm font-semibold tracking-wide">Earthworm</span>
      <span class="text-xs text-base-content/60">管理后台</span>
    </div>

    <nav class="flex-1 overflow-y-auto px-2 py-3">
      <ul class="menu w-full gap-1 p-0">
        <li
          v-for="item in NAV_ITEMS"
          :key="item.key"
        >
          <NuxtLink
            v-if="item.to"
            :to="item.to"
            class="rounded-lg text-sm"
            :class="isActive(item) ? 'active font-medium' : ''"
            @click="emit('close')"
          >
            {{ item.label }}
          </NuxtLink>
          <button
            v-else
            type="button"
            class="flex cursor-not-allowed items-center justify-between rounded-lg text-sm text-base-content/40"
            :aria-disabled="true"
            data-testid="nav-placeholder"
            @click="onPlaceholderClick(item)"
          >
            <span>{{ item.label }}</span>
            <span class="badge badge-ghost badge-xs">后续批次</span>
          </button>
        </li>
      </ul>
    </nav>

    <div class="border-t border-base-300 p-3">
      <div class="mb-2 flex flex-col">
        <span class="truncate text-xs font-medium">{{ adminLabel }}</span>
        <span class="truncate text-xs text-base-content/60">{{ adminDetail }}</span>
      </div>
      <AppButton
        size="sm"
        variant="outline"
        class="w-full"
        @click="onSignOut"
      >
        退出登录
      </AppButton>
    </div>
  </aside>
</template>
