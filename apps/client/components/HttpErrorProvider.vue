<template>
  <slot></slot>
</template>

<script setup lang="ts">
import { toast } from "vue-sonner";

import { injectHttpStatusErrorHandler } from "~/api/http.js";

useHttpStatusError();

function useHttpStatusError() {
  injectHttpStatusErrorHandler(async (errMessage, statusCode) => {
    switch (statusCode) {
      case 401:
        // 401 = 未登录。这是「页面级数据请求」的正常结果 (游客浏览课程广场 / 会员价格),
        // 页面自身会渲染游客态与登录入口, 全局这里既不能跳转登录页, 也不该弹错误提示:
        // 否则游客态永远显示不出来, 且登录页与落地页之间会来回重定向。
        // 需要登录的「用户主动动作」由按钮显式调用 signIn()
        // (Navbar 登录 / 立即开通 / 申请成为 Partner / 领取奖励), 行为保持不变。
        // 权限不足 (403) 仍由 default 分支提示 (见 partner.vue 等需要权限的页面)。
        break;
      default:
        toast.error(errMessage);
        break;
    }
  });
}
</script>

<style scoped></style>
~/store/user
