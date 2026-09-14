<template>
  <!-- 小屏 (<1024px): 56px 工具条 (汉堡 + Logo), 侧栏改为抽屉 -->
  <header
    class="fixed left-0 top-0 z-30 flex h-14 w-full items-center gap-3 border-b border-[#E5E7EB] bg-white px-4 lg:hidden"
  >
    <button
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-[9px] border border-[#E5E7EB] text-[15px] leading-none text-[#666666]"
      aria-label="打开导航"
      :aria-expanded="isDrawerOpen ? 'true' : 'false'"
      @click="isDrawerOpen = true"
    >
      ☰
    </button>
    <NuxtLink
      to="/"
      class="flex items-center gap-[9px]"
    >
      <span class="app-rail__mark">🐛</span>
      <span class="text-[15px] font-black text-[#1E293B]">学以致用</span>
    </NuxtLink>
  </header>

  <!-- 抽屉遮罩: 点一下关闭 (仅小屏) -->
  <div
    v-if="isDrawerOpen"
    class="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
    @click="closeDrawer"
  ></div>

  <aside
    class="fixed left-0 top-0 z-50 flex h-screen w-[260px] flex-col gap-[10px] bg-white px-3 py-3 transition-transform duration-200 lg:w-[212px] lg:bg-transparent"
    :class="isDrawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
    aria-label="工作台导航"
  >
    <!-- 1. 品牌卡: 点整块回首页 -->
    <NuxtLink
      to="/"
      class="app-rail__card app-rail__brand"
      @click="closeDrawer"
    >
      <span class="app-rail__mark">🐛</span>
      <span class="text-[15px] font-black text-[#1E293B]">学以致用</span>
    </NuxtLink>

    <!-- 2. 导航卡: 三组 11 项, 卡片内滚动 -->
    <nav class="app-rail__card flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-[10px]">
      <template
        v-for="group in WORKBENCH_NAV_GROUPS"
        :key="group.title"
      >
        <p
          class="px-[10px] pb-[5px] pt-2 text-[12px] font-semibold leading-normal tracking-[0.6px] text-[#666666]"
        >
          {{ group.title }}
        </p>
        <NuxtLink
          v-for="item in group.items"
          :key="item.to"
          :to="item.to"
          :class="navItemClass(item.to)"
          @click="closeDrawer"
        >
          <span class="w-[18px] shrink-0 text-center text-[14px]">{{ item.icon }}</span>
          <span class="truncate">{{ item.label }}</span>
        </NuxtLink>
      </template>
    </nav>

    <!-- 3. 用户卡: 点一下展开既有的 UserMenu (不重写菜单) -->
    <button
      type="button"
      class="app-rail__card flex w-full items-center gap-[10px] px-3 py-[11px] text-left"
      @click="handleOpenUserMenu"
    >
      <UAvatar
        :src="userStore.user?.avatar"
        alt="Avatar"
        size="sm"
        class="shrink-0"
      />
      <span class="min-w-0 flex-1">
        <span class="block truncate text-[13.5px] font-extrabold leading-tight text-[#1E293B]">
          {{ displayName }}
        </span>
        <!-- 会员状态标签 = pill-info: 浅蓝底 (primary 10%) + primary-deep 文字, 不承载白字 -->
        <span
          v-if="memberTag"
          class="mt-[2px] inline-block rounded-[999px] bg-[#EFF6FF] px-[7px] py-[1px] text-[12px] font-semibold text-[#2C5AF4]"
        >
          {{ memberTag }}
        </span>
      </span>
    </button>
  </aside>
</template>

<script setup lang="ts">
import { useRoute } from "#imports";
import { computed, ref } from "vue";

import { useUserMenu } from "~/composables/user/useUserMenu";
import { useUserStore } from "~/store/user";
import { isWorkbenchNavActive, WORKBENCH_NAV_GROUPS } from "~/utils/workbenchNav";

const route = useRoute();
const userStore = useUserStore();
const { openUserMenu } = useUserMenu();

/** 抽屉只在小屏有意义; 桌面端由 `lg:translate-x-0` 常驻 */
const isDrawerOpen = ref(false);

function closeDrawer() {
  isDrawerOpen.value = false;
}

/**
 * 导航项样式: 激活态 = 浅蓝底 + 蓝字 + 左侧蓝条 (照目标站, 不是实心胶囊);
 * 非激活态 = wb-muted 文字, 无背景。两种态一次给全, 避免 tailwind 里
 * 「条件类 + 静态类」互相覆盖要靠样式表顺序碰运气。
 */
function navItemClass(to: string) {
  const base =
    "mb-0.5 flex items-center gap-[10px] rounded-[12px] px-[11px] py-[9px] text-[13.5px] transition-colors";

  return isWorkbenchNavActive(route.path, to)
    ? `${base} app-rail__item--on font-extrabold text-[#2C5AF4]`
    : `${base} font-semibold text-[#666666] hover:bg-[#EFF6FF] hover:text-[#2C5AF4]`;
}

const displayName = computed(() => userStore.user?.username || "学习者");

/**
 * 会员状态标签: 复用 useUserStore 里 /user 的 membership (isMember + details.type),
 * 不再单独请求 /membership/status; 用户信息还没到位时先不渲染标签, 避免闪一下「免费会员」。
 */
const memberTag = computed(() => {
  if (!userStore.user) return "";
  if (userStore.isFounderMembership()) return "创始会员";
  return userStore.user.membership?.isMember ? "会员" : "免费会员";
});

function handleOpenUserMenu() {
  closeDrawer();
  openUserMenu();
}
</script>

<style scoped>
/* 三张白卡: 工作台配色 (wb-border / wb-card), 目标站几乎不用阴影, 靠白卡 vs 浅蓝底分层 */
.app-rail__card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(16, 24, 40, 0.05);
}

.app-rail__brand {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 13px;
}

/* 品牌标记: 目标站主色实色 + 白字 (wb-accent, 白字 5.42:1 通过 AA) */
.app-rail__mark {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 9px;
  background: #2c5af4;
  font-size: 14px;
}

/* 激活态: 浅蓝底 (wb-accent-soft) + 左侧 3px 蓝条 —— 与目标站一致 */
.app-rail__item--on {
  position: relative;
  background: #eff6ff;
}
.app-rail__item--on::before {
  content: "";
  position: absolute;
  left: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  border-radius: 999px;
  background: #2c5af4;
}
</style>
