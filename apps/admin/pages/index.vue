<script setup lang="ts">
import { definePageMeta } from "#imports";
import { navigateTo } from "nuxt/app";

import AppLoading from "~/components/ui/AppLoading.vue";

/** 根路径统一进入 Dashboard (守卫已先完成登录/权限判定) */
definePageMeta({ layout: false });

void navigateTo("/dashboard", { replace: true });
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-base-200">
    <AppLoading label="正在进入管理后台" />
  </div>
</template>
