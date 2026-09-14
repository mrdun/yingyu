<!--
  旧首页 (/ 登录后, 走营销外壳) 内嵌的扁平侧栏 —— 登录态首页仍是 <Navbar /> + 居中内容,
  所以这一份导航暂时不能删 (阶段 2 把首页搬进 app-shell 后, 本组件与 components/Home
  里的引用一起下线)。

  菜单数据已与工作台侧栏 AppRail 合并成同一份 (utils/workbenchNav.ts):
  改菜单只改一处, 不会出现新旧两个入口不一致。
-->
<template>
  <nav class="flex flex-col gap-1 border-r border-gray-200 px-3 py-4 dark:border-gray-700">
    <NuxtLink
      v-for="item in WORKBENCH_NAV_ITEMS"
      :key="item.to"
      :to="item.to"
      class="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-purple-600 dark:text-slate-300 dark:hover:bg-gray-800 dark:hover:text-purple-400"
      :class="{
        'bg-purple-50 font-medium text-purple-600 dark:bg-gray-800 dark:text-purple-400':
          isWorkbenchNavActive(route.path, item.to),
      }"
    >
      <span>{{ item.icon }}</span>
      <span>{{ item.label }}</span>
    </NuxtLink>
  </nav>
</template>

<script setup lang="ts">
import { useRoute } from "#imports";

import { isWorkbenchNavActive, WORKBENCH_NAV_ITEMS } from "~/utils/workbenchNav";

const route = useRoute();
</script>
