<template>
  <!-- 区块 1: 用户概览条 (头像 + 问候 + 3 个胶囊 + 右侧圆形按钮) -->
  <section class="ov">
    <div class="ov__id">
      <UAvatar
        :src="props.avatar"
        alt="Avatar"
        size="md"
        class="ov__avatar"
      />
      <div class="min-w-0">
        <p class="ov__name">{{ greeting }}，{{ displayName }} 👋</p>
        <p class="ov__sub">{{ subtitle }}</p>
      </div>
    </div>

    <div class="ov__caps">
      <div class="ov__cap">
        <span class="ov__cap-icon">🪙</span>
        <div class="min-w-0 flex-1">
          <p class="ov__cap-k">金币余额</p>
          <p class="ov__cap-v">{{ formatCount(props.coins) }}<small>币</small></p>
        </div>
      </div>

      <div class="ov__cap">
        <span class="ov__cap-icon">📅</span>
        <div class="min-w-0 flex-1">
          <p class="ov__cap-k">今日练习</p>
          <p class="ov__cap-v">
            {{ formatCount(props.todayStatements) }}<small>/ {{ target }} 句</small>
          </p>
          <div class="ov__bar">
            <i :style="{ width: progressWidth(props.todayStatements, target) }"></i>
          </div>
        </div>
      </div>

      <div class="ov__cap">
        <span class="ov__cap-icon">🔥</span>
        <div class="min-w-0 flex-1">
          <p class="ov__cap-k">连续打卡</p>
          <p class="ov__cap-v">{{ formatCount(props.streak) }}<small>天</small></p>
        </div>
      </div>
    </div>

    <!--
      只保留 设置 / 会员 / 退出 三个圆形按钮。
      ⚠️ 这里**不渲染深色切换按钮**: 工作台外壳已被强制浅色 (layouts/default.vue 刻意移除 html.dark),
      点了没有反应的按钮比没有这个按钮更糟。深色要等 DESIGN.md 补出 wb-* 深色 token 之后再说。
    -->
    <div class="ov__icons">
      <NuxtLink
        to="/User/Setting"
        class="ov__ibtn"
        aria-label="设置"
        title="设置"
      >
        ⚙️
      </NuxtLink>
      <NuxtLink
        to="/membership"
        class="ov__ibtn"
        aria-label="会员"
        title="会员"
      >
        👑
      </NuxtLink>
      <button
        type="button"
        class="ov__ibtn"
        aria-label="退出"
        title="退出"
        @click="handleLogout"
      >
        ↪
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useModal } from "#imports";
import { computed, onMounted, ref } from "vue";

import Dialog from "~/components/common/Dialog.vue";
import { signOut } from "~/services/auth";
import { formatCount, greetingForHour, progressWidth } from "~/utils/memberCenter";

const props = defineProps<{
  avatar?: string;
  username: string;
  coins: number;
  todayStatements: number;
  todayTarget: number;
  streak: number;
  isMember: boolean;
}>();

const modal = useModal();

/**
 * 问候语只在客户端算: `nuxt generate` 会把 `/` 预渲染成游客落地页,
 * 但一旦未来改成预渲染登录态, 服务端/客户端的小时数可能跨零点不一致 → hydration 报错。
 * 先渲染一个中性文案, mount 之后再换成时段问候。
 */
const greeting = ref("你好");

onMounted(() => {
  greeting.value = greetingForHour(new Date().getHours());
});

const displayName = computed(() => props.username || "学习者");

/** 今日目标缺省按 10 句显示, 但绝不显示 0 句这种无意义的目标 */
const target = computed(() => (props.todayTarget > 0 ? props.todayTarget : 10));

const subtitle = computed(() => {
  if (props.todayStatements >= target.value) return "今日目标已完成，明天继续保持 🎉";
  if (props.isMember) return `会员权益已生效，今天也来练 ${target.value} 句吧`;

  return `今天也来练 ${target.value} 句吧，连续打卡别断`;
});

function handleLogout() {
  modal.open(Dialog, {
    title: "退出登录",
    content: "是否确认退出登录？",
    showCancel: true,
    showConfirm: true,
    onConfirm() {
      signOut();
    },
  });
}
</script>

<style scoped>
/* 工作台配色 (wb-*): 白卡 + #E5E7EB 边, 几乎不用阴影 */
.ov {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
  padding: 14px 17px;
}

.ov__id {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.ov__name {
  font-size: 15px;
  font-weight: 900;
  color: #1e293b;
  line-height: 1.35;
}

.ov__sub {
  margin-top: 2px;
  font-size: 11.5px;
  font-weight: 600;
  color: #666666;
}

.ov__caps {
  display: flex;
  flex: 1;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.ov__cap {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 168px;
  border: 1px solid #e4edfb;
  border-radius: 12px;
  background: #f7faff;
  padding: 8px 13px;
}

.ov__cap-icon {
  font-size: 16px;
}

.ov__cap-k {
  font-size: 10.5px;
  font-weight: 700;
  color: #666666;
}

.ov__cap-v {
  margin-top: 1px;
  font-size: 16px;
  font-weight: 900;
  color: #1e293b;
  line-height: 1.2;
}

.ov__cap-v small {
  margin-left: 3px;
  font-size: 11px;
  font-weight: 700;
  color: #666666;
}

/* 进度条: 空态是 0 宽度的蓝条, 底槽仍在 —— 不会塌成一条看不见的线 */
.ov__bar {
  height: 5px;
  margin-top: 5px;
  border-radius: 999px;
  background: #e7eef9;
  overflow: hidden;
}

.ov__bar i {
  display: block;
  height: 100%;
  min-width: 0;
  border-radius: 999px;
  background: #2c5af4;
}

.ov__icons {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.ov__ibtn {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid #e9edf5;
  border-radius: 50%;
  background: #fff;
  font-size: 14px;
  cursor: pointer;
}

.ov__ibtn:hover {
  border-color: #2c5af4;
  background: #eff6ff;
}
</style>
