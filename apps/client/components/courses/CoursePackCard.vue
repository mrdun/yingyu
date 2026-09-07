<template>
  <div
    class="course-pack-card"
    @click="$emit('cardClick', coursePack)"
  >
    <figure class="relative aspect-video overflow-hidden">
      <NuxtImg
        :src="coursePack.cover"
        :placeholder="[288, 180]"
        width="288"
        height="180"
        class="inset-0 h-full w-full object-cover"
      />
      <span
        class="absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium text-white shadow"
        :class="coursePack.isFree ? 'bg-green-500' : 'bg-purple-500'"
      >
        {{ coursePack.isFree ? "免费" : "会员" }}
      </span>
    </figure>
    <div class="card-body">
      <h2 class="card-title truncate">{{ coursePack.title }}</h2>
      <p
        class="description-text"
        :title="coursePack.description"
      >
        {{ coursePack.description }}
      </p>
      <slot name="actions"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  coursePack: {
    id: string;
    title: string;
    description: string;
    cover: string;
    isFree: boolean;
  };
}

defineProps<Props>();

defineEmits<{
  (e: "cardClick", coursePack: any): void;
}>();
</script>

<style scoped>
.course-pack-card {
  @apply flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-soft-lg dark:border-zinc-700 dark:bg-zinc-900;
  @apply hover:text-brand-600;
  width: 100%;
  max-width: 100%; /* 在移动端允许卡片占满整个宽度 */
  height: 100%;
}

.card-body {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.card-title {
  @apply text-lg font-semibold;
  flex-grow: 0;
}

.description-text {
  @apply my-2 line-clamp-2 text-sm text-gray-500;
  flex-grow: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  position: relative;
}

@media (hover: hover) {
  .description-text:hover::after {
    content: attr(title);
    position: absolute;
    left: 0;
    top: 100%;
    z-index: 10;
    background: white;
    padding: 5px;
    border: 1px solid #ddd;
    border-radius: 4px;
    white-space: normal;
    word-wrap: break-word;
    max-width: 300px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
  }
}

/* 暗色模式适配 */
@media (prefers-color-scheme: dark) {
  .description-text:hover::after {
    background: #1a202c;
    border-color: #4a5568;
    color: white;
  }
}

/* 移动端适配 */
@media (max-width: 640px) {
  .course-pack-card {
    max-width: 100%; /* 确保在小屏幕上占满宽度 */
  }

  .card-body {
    padding: 0.75rem; /* 稍微减少内边距 */
  }

  .card-title {
    @apply text-base; /* 减小标题字体大小 */
  }

  .description-text {
    @apply text-xs; /* 减小描述文字大小 */
  }
}
</style>
