<template>
  <Home v-if="isLoggedIn"></Home>
  <Landing v-else></Landing>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";

import { useStartLearning } from "~/composables/useStartLearning";
import { useAuthState } from "~/services/auth";
import { cancelShortcut, registerShortcut } from "~/utils/keyboardShortcuts";

const { isAuthenticated: isLoggedIn } = useAuthState();

/**
 * 首页「开始学习」的跳转逻辑只有一份 (composables/useStartLearning):
 * 直接进入后端返回的默认课程的第一组练习, 不经过课程商城/会员页;
 * 接口异常时才兜底课程商城。游客落地页的按钮调用的是同一个实现。
 */
const { startLearning } = useStartLearning();

/**
 * 回车快捷键在本页注册, 且只注册一次:
 * 游客在落地页按 Enter 与点击「开启学习 →」走的是同一个 startLearning。
 */
onMounted(() => {
  registerShortcut("enter", startLearning);
});

onUnmounted(() => {
  cancelShortcut("enter", startLearning);
});
</script>
