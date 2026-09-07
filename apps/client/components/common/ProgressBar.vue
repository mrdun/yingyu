<template>
  <div class="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
    <div
      class="h-full rounded-full bg-gradient-to-r from-brand-600 via-brand-400 to-brand-300 transition-all duration-700"
      :style="{ width: `${percentage}%` }"
    ></div>
  </div>
</template>

<script setup lang="ts">
defineProps(["percentage"]);
</script>
