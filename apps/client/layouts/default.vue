<template>
  <div
    class="h-full w-full bg-cream text-slate-600 transition-colors dark:bg-theme-dark dark:text-slate-300"
  >
    <div
      v-if="renderError"
      class="fixed inset-0 z-[9999] overflow-auto bg-red-50 p-6 text-sm text-red-700"
    >
      <h2 class="mb-2 text-lg font-bold">渲染错误</h2>
      <pre class="whitespace-pre-wrap">{{ renderError }}</pre>
    </div>

    <!--
      工作台外壳 (app-shell): 登录后的业务页。
      固定侧栏 AppRail (212px) + 独立圆角内容面板, 面板自身滚动。
      这一支**没有顶部通栏 Navbar, 也没有 Footer** —— Logo 在侧栏顶部, 用户菜单在侧栏用户卡。
    -->
    <div
      v-if="isWorkbenchShell"
      class="h-screen w-full overflow-hidden bg-white text-slate-600"
    >
      <AppRail />
      <!-- 小屏: 让出 56px 工具条; ≥1024px: 让出 212px 侧栏 -->
      <div class="mb-[10px] ml-[10px] mr-[10px] mt-[66px] lg:ml-[222px] lg:mt-[10px]">
        <div
          class="h-[calc(100vh-76px)] overflow-y-auto rounded-[10px] border border-[#E5E7EB] bg-[#F1F4FD] px-[18px] py-[16px] lg:h-[calc(100vh-20px)]"
        >
          <!-- 面板内沿用原来 1280px 的内容上限: 宽屏下页面不会被拉成一条, 阶段 2 再按新栅格重排 -->
          <div class="mx-auto w-full max-w-screen-xl">
            <NuxtPage />
          </div>
        </div>
      </div>
    </div>

    <!--
      营销外壳: 未登录的任何页面 / 落地页 `/` / 沉浸式练习 `/game/*` / 协议页。
      外观与改造前完全一致 (顶部通栏 + 居中单栏 + Footer)。
    -->
    <div
      v-else
      class="m-auto flex h-fit min-h-screen flex-col items-center"
    >
      <Navbar />
      <div class="flex w-full flex-1 px-5">
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
import { onErrorCaptured, ref, watch } from "vue";

import AppRail from "~/components/workbench/AppRail.vue";
import { useAppShell } from "~/composables/useAppShell";

const renderError = ref("");

onErrorCaptured((err) => {
  renderError.value = err?.message || String(err);
  return false;
});

// 外壳判定只有一份: 纯函数在 utils/appShell.ts, 这里只接响应式输入
const { isWorkbenchShell } = useAppShell();

/**
 * 工作台外壳**强制浅色**。
 *
 * 为什么: 目标站 juyouenglish.com 是纯浅色设计, DESIGN.md 的工作台调色板 (wb-*) 也只有浅色 token。
 * 但仓库里有 14 个页面写了 `dark:text-white` 之类的变体, Tailwind 又是 `darkMode: "class"` ——
 * 系统深色 / 用户切过深色时, `html.dark` 会让这些文字变浅, 直接压在浅蓝面板 (#F1F4FD) 上看不见。
 *
 * 做法: 进工作台时**移除** html 上的 `dark` class, 离开时按进入前的状态**还原**。
 * ⚠️ 直接操作 class 而**不调用 setDarkMode()** —— 后者会写 localStorage, 把用户存的偏好覆盖成"浅色"。
 * 阶段 2 若要真正支持深色, 应给 DESIGN.md 补深色 token 并逐页实现对应用色, 而不是靠这里兜。
 */
let themeBeforeWorkbench: "dark" | "light" | null = null;

watch(
  isWorkbenchShell,
  (isWorkbench) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;

    if (isWorkbench) {
      if (themeBeforeWorkbench === null) {
        themeBeforeWorkbench = root.classList.contains("dark") ? "dark" : "light";
      }
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
    } else if (themeBeforeWorkbench !== null) {
      const restore = themeBeforeWorkbench;
      themeBeforeWorkbench = null;
      if (restore === "dark") {
        root.classList.add("dark");
        root.setAttribute("data-theme", "dark");
      }
    }
  },
  { immediate: true },
);
</script>
