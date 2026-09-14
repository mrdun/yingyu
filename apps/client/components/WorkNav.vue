<template>
  <nav class="flex flex-col gap-1 border-r border-gray-200 px-3 py-4 dark:border-gray-700">
    <NuxtLink
      v-for="item in menuItems"
      :key="item.to"
      :to="item.to"
      class="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-purple-600 dark:text-slate-300 dark:hover:bg-gray-800 dark:hover:text-purple-400"
      :class="{
        'bg-purple-50 font-medium text-purple-600 dark:bg-gray-800 dark:text-purple-400': isActive(
          item.to,
        ),
      }"
    >
      <span>{{ item.icon }}</span>
      <span>{{ item.label }}</span>
    </NuxtLink>
  </nav>
</template>

<script setup lang="ts">
import { useRoute } from "#imports";

const route = useRoute();

const menuItems = [
  { label: "主页", to: "/", icon: "🏠" },
  { label: "课程广场", to: "/course-pack", icon: "📚" },
  { label: "课程向导", to: "/learning-path", icon: "🗺️" },
  { label: "我的课程", to: "/my-courses", icon: "🎒" },
  { label: "看图学词", to: "/picture-word", icon: "🖼️" },
  { label: "复习", to: "/review", icon: "🔁" },
  { label: "奖励", to: "/rewards", icon: "🎁" },
  { label: "成长报告", to: "/stats", icon: "📈" },
  { label: "会员", to: "/membership", icon: "👑" },
  { label: "推广中心", to: "/partner", icon: "🤝" },
  { label: "设置", to: "/User/Setting", icon: "⚙️" },
];

function isActive(to: string) {
  return route.path === to;
}
</script>
