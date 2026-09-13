<template>
  <div
    class="course-pack-card"
    @click="$emit('cardClick', coursePack)"
  >
    <figure class="relative aspect-video overflow-hidden">
      <NuxtImg
        :src="coursePack.cover ?? ''"
        :placeholder="[288, 180]"
        width="288"
        height="180"
        class="inset-0 h-full w-full object-cover"
      />
      <span
        class="absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium text-white shadow"
        :class="isFree ? 'bg-green-500' : 'bg-purple-500'"
      >
        {{ isFree ? "免费" : "会员专享" }}
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
      <slot name="actions">
        <span
          v-if="showAction"
          class="mt-3 inline-flex w-full items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-white shadow transition-colors duration-200"
          :class="isFree ? 'bg-brand-600 hover:bg-brand-500' : 'bg-purple-500 hover:bg-purple-400'"
        >
          {{ actionLabel }}
        </span>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import type { CoursePackCardModel } from "~/utils/coursePackEntry";
import { resolveCoursePackCardActionLabel } from "~/utils/coursePackEntry";

interface Props {
  /**
   * 必须是后端返回的完整课程包对象 (至少保留 accessible):
   * 列表页手工裁剪字段会丢掉 accessible, 导致点击决策恒为 falsy。
   */
  coursePack: CoursePackCardModel;
  /**
   * 是否展示自动动作文案。默认展示 (课程广场);
   * 学习路线等「拿不到 accessible」的场景可关闭, 避免给会员显示「开通会员解锁」这类错误提示。
   */
  showAction?: boolean;
}

/**
 * 默认值必须写在 `withDefaults` 里, 不能靠 `props.showAction !== false` 兜底:
 * Vue 对 `Boolean` 类型的 prop 有特殊转换规则 —— 上层未传 `show-action` 时,
 * props 里会被填入 `false` (Boolean prop 缺省即 false), **不是** `undefined`。
 * 于是 `props.showAction !== false` 恒为 false, 兜底动作文案永远走 v-if=false,
 * 渲染成 `<!---->` (P1 缺陷: 卡片上既没有「立即开始学习」也没有「开通会员解锁」)。
 */
const props = withDefaults(defineProps<Props>(), {
  showAction: true,
});

const isFree = computed(() => {
  if (props.coursePack.accessLevel) return props.coursePack.accessLevel === "free";
  return props.coursePack.isFree === true;
});

const actionLabel = computed(() => resolveCoursePackCardActionLabel(props.coursePack));
const showAction = computed(() => props.showAction);

defineEmits<{
  (e: "cardClick", coursePack: CoursePackCardModel): void;
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
