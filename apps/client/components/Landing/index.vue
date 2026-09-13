<template>
  <div class="font-customFont">
    <LandingBanner @start-earthworm="startLearning" />
    <LandingFeatures />
    <LandingComments />
    <LandingQuestions />
    <LandingContact />
    <CommonBackTop class="sticky bottom-28 ml-auto flex justify-end sm:block" />
  </div>
</template>

<script setup lang="ts">
import { useStartLearning } from "~/composables/useStartLearning";

/**
 * 游客主入口: 「开启学习 →」直接进入默认课程的第一组练习 (不经过课程商城)。
 * 复用 composables/useStartLearning, 与登录态首页、回车快捷键是同一份实现;
 * 这里不再单独注册 Enter 快捷键 (由 pages/index.vue 统一注册一次)。
 */
const { startLearning } = useStartLearning();
</script>
