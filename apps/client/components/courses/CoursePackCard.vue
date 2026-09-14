<template>
  <div
    class="course-pack-card"
    :class="variantClass"
    @click="$emit('cardClick', coursePack)"
  >
    <!--
      工作台形态的封面: 渐变色块 + 居中图标。
      设计稿的工作台卡片没有「免费 / 会员专享」徽章, 封面也不是远程图片。
    -->
    <figure
      v-if="isWorkbench"
      class="wb-cover"
      :style="{ backgroundImage: coverGradient }"
      aria-hidden="true"
    >
      <span class="wb-cover__icon">{{ coverIcon }}</span>
    </figure>

    <!-- 营销形态的封面 (课程广场 / 学习路线 / 课程包详情): 远程封面图 + 免费/会员徽章, 原样保留 -->
    <figure
      v-else
      class="relative aspect-video overflow-hidden"
    >
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
    <div
      class="card-body"
      :class="{ 'card-body--wb': isWorkbench }"
    >
      <h2
        class="card-title truncate"
        :class="{ 'card-title--wb': isWorkbench }"
      >
        {{ coursePack.title }}
      </h2>
      <!-- 工作台形态的第二行是进度: 拿不到进度时退化成课程包描述 (见 utils/coursePackCard.ts) -->
      <p
        v-if="isWorkbench"
        class="wb-meta"
        :title="metaLine"
      >
        {{ metaLine }}
      </p>
      <p
        v-else
        class="description-text"
        :title="coursePack.description ?? undefined"
      >
        {{ coursePack.description }}
      </p>
      <!--
        工作台形态: 设计稿里只有一个整宽蓝按钮 (不用 actions 槽, 也不做免费/会员双色)。
        文案按**进度**派生 (「开始第一课 / 继续游戏」), 不用权限派生的 actionLabel ——
        「我的课程」的接口不返回权限字段, 用权限文案会给能学的用户显示「开通会员解锁」。
        详见 utils/coursePackCard.ts 的 resolveWorkbenchCardActionLabel。
      -->
      <button
        v-if="isWorkbench && showAction"
        type="button"
        class="wb-btn"
      >
        {{ workbenchActionLabel }}
      </button>
      <slot
        v-else
        name="actions"
      >
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

import type { CoursePackCardVariant, CoursePackProgressInput } from "~/utils/coursePackCard";
import type { CoursePackCardModel } from "~/utils/coursePackEntry";
import {
  coursePackCardVariantClass,
  coursePackCoverGradient,
  coursePackCoverIcon,
  resolveCoursePackCardMetaLine,
  resolveCoursePackCardVariant,
  resolveWorkbenchCardActionLabel,
} from "~/utils/coursePackCard";
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
  /**
   * 卡片形态。
   * - `default` (缺省): 营销外壳外观 —— 大圆角 + 暖调阴影 + 免费/会员徽章 + 胶囊按钮
   *   (课程广场 `/course-pack`、学习路线、课程包详情);
   * - `workbench`: 工作台外观 (会员中心「我的课程」) —— 白卡 + 1px #E5E7EB 边 + 圆角 12px + 无阴影
   *   + 渐变色封面 + 整宽蓝按钮, 见 DESIGN.md `## Colors` 工作台调色板。
   */
  variant?: CoursePackCardVariant;
  /**
   * 工作台形态的第二行进度 (`GET /course-pack/:id/progress`)。
   * 拿不到就别传: 会自动退化成课程包描述, 不编造百分比。
   */
  progress?: CoursePackProgressInput | null;
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
  variant: "default",
  progress: null,
});

const isFree = computed(() => {
  if (props.coursePack.accessLevel) return props.coursePack.accessLevel === "free";
  return props.coursePack.isFree === true;
});

const actionLabel = computed(() => resolveCoursePackCardActionLabel(props.coursePack));
const showAction = computed(() => props.showAction);
/** 工作台形态的按钮文案: 按进度派生 (设计稿的「开始第一课 / 继续游戏」), 见 utils/coursePackCard.ts */
const workbenchActionLabel = computed(() => resolveWorkbenchCardActionLabel(props.progress));

/**
 * 形态开关与形态类都由纯函数解析 (utils/coursePackCard.ts), 组件里不内联判断:
 * 「课程广场形态不许被工作台样式污染」这条约束因此在源码级守卫里可被钉住。
 */
const isWorkbench = computed(() => resolveCoursePackCardVariant(props.variant) === "workbench");
const variantClass = computed(() => coursePackCardVariantClass(props.variant));
const coverGradient = computed(() => coursePackCoverGradient(props.coursePack?.id));
const coverIcon = computed(() => coursePackCoverIcon(props.coursePack?.id));
const metaLine = computed(() =>
  resolveCoursePackCardMetaLine(props.coursePack?.description, props.progress),
);

defineEmits<{
  (e: "cardClick", coursePack: CoursePackCardModel): void;
}>();
</script>

<style scoped>
/* 两种形态共用的骨架 (尺寸/布局/交互), 视觉全部落在下面的两个形态类里 */
.course-pack-card {
  @apply flex cursor-pointer flex-col overflow-hidden transition-all duration-300;
  width: 100%;
  max-width: 100%; /* 在移动端允许卡片占满整个宽度 */
  height: 100%;
}

/*
 * 默认形态 (课程广场 / 学习路线 / 课程包详情): 营销外壳外观 —— 大圆角 + 暖调阴影 + hover 上浮。
 * ⚠️ 这是课程广场的样子, 不要改。
 */
.course-pack-card--default {
  @apply rounded-2xl border border-zinc-200 bg-white shadow-soft hover:-translate-y-1 hover:text-brand-600 hover:shadow-soft-lg dark:border-zinc-700 dark:bg-zinc-900;
}

/*
 * 工作台形态 (会员中心「我的课程」): 白卡 + 1px #E5E7EB 边 + 圆角 12px + 无阴影。
 * 工作台靠「白卡 vs 浅蓝面板」分层, 不用投影, 也不做 hover 上浮。
 */
.course-pack-card--wb {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  box-shadow: none;
}

.course-pack-card--wb:hover {
  transform: none;
  box-shadow: none;
  color: #1e293b;
}

/*
 * 工作台封面: 设计稿是**固定 72px 的细色条** (`.course .cover { height: 72px; font-size: 24px }`),
 * 不是 16:9 大图 —— 卡片整体高度以此为准。渐变色块按课程包 id 稳定取。 */
.wb-cover {
  @apply relative flex items-center justify-center overflow-hidden;
  height: 72px;
}

.wb-cover__icon {
  font-size: 24px;
  line-height: 1;
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

/* 工作台形态: 标题 13px/800 wb-text, 进度 12px/600 wb-muted (最小字号 12px) */
.card-body--wb {
  padding: 12px;
}

.card-title--wb {
  font-size: 13px;
  font-weight: 800;
  color: #1e293b;
}

.wb-meta {
  margin-top: 3px;
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  color: #666666;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 工作台形态的按钮: 整宽 + 圆角 8px + 单一主色 (wb-accent, 白字 5.42:1 通过 AA) */
.wb-btn {
  width: 100%;
  margin-top: 10px;
  padding: 7px;
  border: none;
  border-radius: 8px;
  background: #2c5af4;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.wb-btn:hover {
  background: #2a64e7;
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

  .card-body:not(.card-body--wb) {
    padding: 0.75rem; /* 稍微减少内边距 */
  }

  .card-title:not(.card-title--wb) {
    @apply text-base; /* 减小标题字体大小 */
  }

  .description-text {
    @apply text-xs; /* 减小描述文字大小 */
  }
}
</style>
