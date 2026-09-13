<template>
  <Home v-if="isLoggedIn"></Home>
  <Landing v-else></Landing>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";

import { fetchDefaultLearningEntry } from "~/api/course-pack";
import { useAuthState } from "~/services/auth";
import { cancelShortcut, registerShortcut } from "~/utils/keyboardShortcuts";
import { resolveStartLearningTarget } from "~/utils/learningEntry";

const { isAuthenticated: isLoggedIn } = useAuthState();
const router = useRouter();

/**
 * 首页「开始学习」(含回车快捷键):
 * 直接进入后端返回的默认课程的第一组练习, 不经过课程商城/会员页。
 * 接口异常时兜底到课程商城, 保证用户不会卡在首页。
 */
async function startEarthworm() {
  let entry = null;
  try {
    entry = await fetchDefaultLearningEntry();
  } catch {
    entry = null;
  }
  await router.push(resolveStartLearningTarget(entry).path);
}

onMounted(() => {
  registerShortcut("enter", startEarthworm);
});

onUnmounted(() => {
  cancelShortcut("enter", startEarthworm);
});
</script>
