<template>
  <!--
    区块 2: 会员转化横幅 —— **只有非会员能看到** (父组件用 v-if="!isMember" 控制),
    会员身份下整块不渲染, 不留空白占位。
    ⚠️ 目标站是「橙底白字」, 对比度只有 2.20:1 不达标 —— 这里按 DESIGN.md 的 wb-* 规定:
    橙底 (wb-warn-bg) + 深棕字 (wb-warn-ink), CTA 用主色蓝 (wb-accent) + 白字。
  -->
  <section class="upsell">
    <span class="upsell__icon">💎</span>
    <div class="min-w-0 flex-1">
      <p class="upsell__title">开通会员，解锁全部课程与不限次练习</p>
      <p class="upsell__sub">一次买断长期有效 · 全部会员课程 · 不限次练习与复习</p>
    </div>
    <div class="upsell__act">
      <NuxtLink
        to="/membership"
        class="upsell__cta"
      >
        了解会员权益 →
      </NuxtLink>
      <NuxtLink
        to="/membership"
        class="upsell__link"
      >
        先看看和免费版的区别 ›
      </NuxtLink>
    </div>
  </section>
</template>

<script setup lang="ts">
// 纯展示区块: 文案与入口固定, 没有自己的取数 (会员判定在 components/Home/index.vue)
</script>

<style scoped>
.upsell {
  display: flex;
  align-items: center;
  gap: 14px;
  border: 1px solid #ffe0b2;
  border-radius: 14px;
  background: #fff4e0;
  padding: 15px 18px;
}

.upsell__icon {
  font-size: 22px;
}

.upsell__title {
  font-size: 14.5px;
  font-weight: 900;
  color: #8a4b00;
  line-height: 1.4;
}

.upsell__sub {
  margin-top: 3px;
  font-size: 12px;
  font-weight: 600;
  color: #a9691f;
}

.upsell__act {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
  flex-shrink: 0;
}

.upsell__cta {
  border-radius: 8px;
  background: #2c5af4;
  color: #fff;
  padding: 10px 20px;
  font-size: 13.5px;
  font-weight: 900;
  text-decoration: none;
  white-space: nowrap;
}

.upsell__cta:hover {
  background: #2a64e7;
}

.upsell__link {
  font-size: 11.5px;
  font-weight: 800;
  color: #8a4b00;
  text-decoration: none;
  white-space: nowrap;
}
</style>
