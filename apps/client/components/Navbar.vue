<template>
  <header
    class="w-full px-5 font-customFont transition-all duration-300 ease-linear"
    :class="{
      'sticky top-0 z-10': isStickyNavBar,
      'glass bg-gradient-to-r from-transparent via-white/10 to-transparent shadow-md':
        isStickyNavBar && isScrolled,
    }"
  >
    <div class="mx-auto max-w-screen-xl">
      <div class="flex h-16 items-center justify-between">
        <div class="flex flex-1 items-center justify-between">
          <NuxtLink to="/">
            <div class="logo flex items-center">
              <img
                width="48"
                height="48"
                class="mr-6 hidden overflow-hidden rounded-md md:block"
                src="/logo.png"
                alt="earth-worm-logo"
              />
              <h1 class="text-wrap text-2xl font-extrabold leading-normal dark:text-white">
                Earthworm
              </h1>
            </div>
          </NuxtLink>

          <nav
            v-if="route.path === '/' && !isAuthenticated()"
            aria-label="Global"
            class="hidden md:block"
          >
            <ul class="flex items-center text-base">
              <li
                class="px-4"
                v-for="(optItem, optIndex) in HEADER_OPTIONS"
                :key="optIndex"
              >
                <a
                  class="text-nowrap hover:text-purple-600 dark:text-white dark:hover:text-purple-400"
                  :href="optItem.href"
                  :target="optItem.target ?? '_self'"
                >
                  {{ optItem.name }}
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div class="flex items-center">
          <!-- 显示用户信息 -->
          <div
            v-if="isAuthenticated()"
            class="logged-in flex items-center"
          >
            <div class="flex items-center">
              <!-- 金币余额 -->
              <NuxtLink
                v-if="coinBalance !== null"
                to="/rewards"
                class="mr-3 flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                title="前往奖励中心"
              >
                🪙 {{ coinBalance.coins }}
              </NuxtLink>
              <div
                class="h-8 w-8 cursor-pointer overflow-hidden rounded-full bg-gray-300 transition-all hover:scale-125 hover:opacity-90 dark:bg-gray-700"
                @click="openUserMenu"
              >
                <UAvatar
                  :src="userStore.user?.avatar"
                  alt="Avatar"
                />
              </div>
            </div>
          </div>
          <!-- 登录/注册 -->
          <button
            v-else
            aria-label="Login"
            class="btn btn-sm mr-1 border-none bg-purple-500 text-white shadow-md hover:bg-purple-600 focus:outline-none"
            @click="signIn()"
          >
            登录
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useWindowScroll } from "@vueuse/core";
import { useRuntimeConfig } from "nuxt/app";
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";

import type { CoinBalance } from "~/api/coins";
import { fetchCoinBalance } from "~/api/coins";
import { useUserMenu } from "~/composables/user/useUserMenu";
import { isAuthenticated, signIn } from "~/services/auth";
import { useUserStore } from "~/store/user";

const coinBalance = ref<CoinBalance | null>(null);

async function loadCoinBalance() {
  if (!isAuthenticated()) return;
  try {
    coinBalance.value = await fetchCoinBalance();
  } catch {
    coinBalance.value = null;
  }
}

onMounted(() => {
  loadCoinBalance();
});

const runtimeConfig = useRuntimeConfig();
const { openUserMenu } = useUserMenu();

const route = useRoute();
const userStore = useUserStore();
const { y } = useWindowScroll();

const SCROLL_THRESHOLD = 8;
// https://developer.mozilla.org/zh-CN/docs/Web/HTML/Element/a#%E5%B1%9E%E6%80%A7
interface AnchorAttributes extends Record<string, any> {
  href: string;
  target?: string;
  download?: string;
}
const HEADER_OPTIONS: AnchorAttributes[] = [
  { name: "编辑器", href: "/editor" },
  { name: "复习", href: "/review" },
  { name: "报告", href: "/stats" },
  { name: "奖励", href: "/rewards" },
  { name: "文档", href: runtimeConfig.public.helpDocsURL as string, target: "_blank" },
  { name: "功能", href: "#features" },
  { name: "问题", href: "#faq" },
  { name: "联系我们", href: "#contact" },
];

// TODO: 设置需要固定导航栏的页面
const isStickyNavBar = computed(() =>
  ["index", "User-Setting", "mastered-elements"].includes(route.name as string),
);
const isScrolled = computed(() => y.value >= SCROLL_THRESHOLD);
</script>
