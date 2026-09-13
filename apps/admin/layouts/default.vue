<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";

import AppSidebar from "~/components/layout/AppSidebar.vue";
import AppTopbar from "~/components/layout/AppTopbar.vue";
import { useAdminSession } from "~/composables/useAdminSession";
import { buildBreadcrumb, resolvePageTitle } from "~/utils/nav";

const route = useRoute();
const session = useAdminSession();
const sidebarOpen = ref(false);

const pageTitle = computed(() => resolvePageTitle(String(route.path)));
const breadcrumb = computed(() => buildBreadcrumb(String(route.path)));

onMounted(() => {
  void session.load();
});

// 路由切换后自动收起移动端抽屉
watch(
  () => route.fullPath,
  () => {
    sidebarOpen.value = false;
  },
);
</script>

<template>
  <div class="flex min-h-screen bg-base-200">
    <AppSidebar
      :open="sidebarOpen"
      @close="sidebarOpen = false"
    />
    <div class="flex min-w-0 flex-1 flex-col">
      <AppTopbar
        :title="pageTitle"
        :breadcrumb="breadcrumb"
        @toggle-sidebar="sidebarOpen = !sidebarOpen"
      />
      <main class="flex-1 px-4 py-5 md:px-6">
        <slot />
      </main>
    </div>
  </div>
</template>
