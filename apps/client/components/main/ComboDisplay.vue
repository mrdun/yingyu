<template>
  <div
    ref="comboContainer"
    class="fixed right-4 top-4 z-50 flex items-center gap-2 font-sans transition-all duration-300"
    :class="{
      'scale-75 opacity-50': comboCount === 0,
      'scale-100 opacity-100': comboCount > 0,
      'animate-pulse': comboCount >= 10,
    }"
  >
    <!-- 火焰图标 -->
    <div
      ref="fireIcon"
      class="flex items-center justify-center"
    >
      <UIcon
        name="i-heroicons-fire"
        class="h-8 w-8"
        :class="{
          'text-orange-400': comboCount >= 3 && comboCount < 5,
          'text-orange-500': comboCount >= 5 && comboCount < 10,
          'text-red-500': comboCount >= 10 && comboCount < 20,
          'text-red-600': comboCount >= 20,
          'text-gray-500': comboCount < 3,
        }"
      />
    </div>

    <!-- 连击文本 -->
    <div class="flex flex-col">
      <span class="text-lg font-bold text-gray-800 dark:text-gray-200">
        {{ comboCount }} 连击
      </span>
      <span
        class="text-sm font-semibold"
        :class="{
          'text-gray-500 dark:text-gray-400': multiplier === 1.0,
          'text-green-500': multiplier > 1.0 && multiplier < 1.5,
          'text-green-400': multiplier >= 1.5 && multiplier < 2.0,
          'text-yellow-400': multiplier >= 2.0,
        }"
      >
        {{ multiplier.toFixed(1) }}x
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";

import { useComboTracker } from "~/composables/main/comboTracker";

const { $anime } = useNuxtApp();
const { comboCount, multiplier } = useComboTracker();

const comboContainer = ref(null);
const fireIcon = ref(null);

// 连击增加时的动画
function animateComboIncrement() {
  if (!comboContainer.value) return;

  $anime({
    targets: comboContainer.value,
    scale: [
      { value: 1.3, duration: 100, easing: "easeOutQuad" },
      { value: 1.0, duration: 200, easing: "easeOutQuad" },
    ],
    rotate: [
      { value: -5, duration: 100, easing: "easeOutQuad" },
      { value: 5, duration: 100, easing: "easeOutQuad" },
      { value: 0, duration: 100, easing: "easeOutQuad" },
    ],
  });

  // 火焰图标抖动
  if (fireIcon.value) {
    $anime({
      targets: fireIcon.value,
      translateY: [
        { value: -3, duration: 100, easing: "easeOutQuad" },
        { value: 3, duration: 100, easing: "easeOutQuad" },
        { value: 0, duration: 100, easing: "easeOutQuad" },
      ],
      rotate: [
        { value: -15, duration: 100, easing: "easeOutQuad" },
        { value: 15, duration: 100, easing: "easeOutQuad" },
        { value: 0, duration: 100, easing: "easeOutQuad" },
      ],
      scale: [
        { value: 1.4, duration: 100, easing: "easeOutQuad" },
        { value: 1.0, duration: 200, easing: "easeOutQuad" },
      ],
    });
  }
}

// 连击归零时的动画
function animateComboReset() {
  if (!comboContainer.value) return;

  $anime({
    targets: comboContainer.value,
    opacity: [1, 0.5],
    scale: [1, 0.75],
    duration: 300,
    easing: "easeOutQuad",
  });
}

// 监听连击变化
watch(comboCount, (newValue, oldValue) => {
  if (newValue > oldValue) {
    // 连击增加
    animateComboIncrement();
    playComboSound(newValue);
  } else if (newValue < oldValue) {
    // 连击归零
    animateComboReset();
  }
});

// 根据连击数播放不同的音效
function playComboSound(combo) {
  const audio = new Audio();
  let soundFile = null;

  // 连击里程碑音效
  if (combo === 3 || combo === 5 || combo === 10 || combo === 20) {
    // 使用答对音效作为连击里程碑音效
    soundFile = "/sounds/right.mp3";
  }

  if (soundFile) {
    audio.src = soundFile;
    audio.volume = 0.5;
    audio.play().catch((err) => {
      // 忽略自动播放限制错误
      console.debug("Combo sound play failed:", err);
    });
  }
}
</script>
