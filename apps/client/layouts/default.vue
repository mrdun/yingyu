<template>
  <div
    class="h-full w-full bg-white text-slate-600 transition-colors dark:bg-theme-dark dark:text-slate-300"
  >
    <div
      v-if="renderError"
      class="fixed inset-0 z-[9999] overflow-auto bg-red-50 p-6 text-sm text-red-700"
    >
      <h2 class="mb-2 text-lg font-bold">渲染错误</h2>
      <pre class="whitespace-pre-wrap">{{ renderError }}</pre>
    </div>
    <div class="m-auto flex h-fit min-h-screen flex-col items-center">
      <Navbar />
      <FoundingMemberNotice></FoundingMemberNotice>
      <!-- 登录态: 左侧固定工作台导航 + 右侧主内容 -->
      <div
        v-if="showWorkNav"
        class="flex w-full flex-1 items-stretch"
      >
        <div class="w-52 shrink-0">
          <div class="sticky top-16 max-h-[calc(100vh-4rem)] self-start overflow-y-auto">
            <WorkNav />
          </div>
        </div>
        <div class="min-w-0 flex-1 px-5">
          <div class="mx-auto w-full max-w-screen-xl flex-1">
            <NuxtPage />
          </div>
        </div>
      </div>
      <!-- 未登录/首页/营销页/沉浸学习页: 维持原有顶部导航布局 -->
      <div
        v-else
        class="flex w-full flex-1 px-5"
      >
        <div class="mx-auto flex w-full max-w-screen-xl flex-1">
          <NuxtPage />
        </div>
      </div>
      <Footer></Footer>
    </div>
  </div>
  <UserMenu />
</template>

<script setup lang="ts">
import { useRoute } from "#imports";
import { computed, onErrorCaptured, ref } from "vue";

import FoundingMemberNotice from "../components/FoundingMemberNotice.vue";
import WorkNav from "../components/WorkNav.vue";
import { isAuthenticated } from "../services/auth";

const renderError = ref("");

onErrorCaptured((err) => {
  renderError.value = err?.message || String(err);
  return false;
});

const route = useRoute();

// 首页与营销页不显示左侧导航; /game 全屏沉浸学习、/admin、/editor 也走全宽布局
const HIDDEN_PREFIXES = ["/game", "/admin", "/editor", "/privacy-policy", "/terms"];
const HIDDEN_PATHS = ["/"];

const showWorkNav = computed(() => {
  if (!isAuthenticated()) return false;
  if (HIDDEN_PATHS.includes(route.path)) return false;
  return !HIDDEN_PREFIXES.some((prefix) => route.path.startsWith(prefix));
});
</script>
