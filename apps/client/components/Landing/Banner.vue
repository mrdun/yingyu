<template>
  <section class="relative bg-cream pb-20 pt-28">
    <div class="mx-auto max-w-[860px] px-6 text-center">
      <!-- pill-info：浅蓝底 + primary-deep 文字 -->
      <span
        class="inline-flex items-center gap-2 rounded-full bg-[rgba(77,150,255,0.1)] px-4 py-2 text-[12.5px] font-bold text-[#2563EB]"
      >
        🎮 学以致用：像玩游戏一样练英语
      </span>

      <h1
        class="mb-5 mt-[22px] text-[34px] font-black leading-[1.16] tracking-[-0.5px] text-[#0F172A] md:text-[52px]"
      >
        让你的英语学习
        <br />
        <span class="grad-text">上瘾到停不下来</span>
      </h1>

      <!-- 需要阅读的次要文字用 text-muted(#5B6B80)，不用不达 AA 的 text-subtle -->
      <p class="mx-auto mb-[30px] max-w-[560px] text-[15px] leading-[1.85] text-[#5B6B80]">
        通过连词成句、i+1 可理解输入与游戏化闯关，在真实对话实战中快速掌握最纯正的英语表达。
      </p>

      <div class="mb-3.5 flex flex-col items-center justify-center gap-3.5 sm:flex-row">
        <button
          type="button"
          class="btn-primary w-full sm:w-auto"
          @click="handleKeydown"
        >
          开启学习 →
        </button>
        <a
          class="btn-ghost w-full sm:w-auto"
          href="#features"
        >
          ▶ 看看怎么玩
        </a>
      </div>

      <p class="text-[12px] font-semibold text-[#5B6B80]">
        免费开始 · 无需信用卡 · 支持电脑 / 平板 / 手机
      </p>

      <!-- 产品预览：浏览器窗口模拟（替换原来的静态截图 img） -->
      <div class="shot mx-auto mt-10 max-w-[760px] text-left">
        <div
          class="flex items-center gap-[6px] border-b border-[#EEF2F7] bg-[#F8FAFC] px-[14px] py-[10px]"
        >
          <span class="h-[10px] w-[10px] rounded-full bg-[#FF5F57]"></span>
          <span class="h-[10px] w-[10px] rounded-full bg-[#FEBC2E]"></span>
          <span class="h-[10px] w-[10px] rounded-full bg-[#28C840]"></span>
        </div>
        <div class="px-6 py-[22px]">
          <p class="mb-[6px] text-[12px] font-semibold text-[#5B6B80]">把下面这句话翻译成英文</p>
          <p class="mb-[14px] text-[19px] font-extrabold text-[#0F172A]">我今天需要做这件事情</p>
          <p
            class="rounded-xl border border-dashed border-[#C7D9F7] bg-[#F6F9FF] px-[14px] py-[11px] text-[15px] font-bold text-[#1E293B]"
          >
            i need to do it today
          </p>
          <div class="mt-[14px] flex flex-wrap gap-2">
            <!-- 奖励黄在米黄底上必须自带 1px 边框，否则会"陷进去" -->
            <span
              class="rounded-full border border-[#EAC300] bg-[#FFD93D] px-2.5 py-1 text-[11px] font-bold text-[#4A3800]"
            >
              🔥 连击连对
            </span>
            <span
              class="rounded-full bg-[#E8F0FF] px-2.5 py-1 text-[11px] font-bold text-[#2563EB]"
            >
              🧩 拼图闯关
            </span>
            <span
              class="rounded-full border border-[#EAC300] bg-[#FFD93D] px-2.5 py-1 text-[11px] font-bold text-[#4A3800]"
            >
              🪙 答对得金币
            </span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const emit = defineEmits(["start-earthworm"]);

function handleKeydown() {
  emit("start-earthworm");
}
</script>

<style scoped>
/* h1 第二行：设计稿的渐变裁字（不是衬线斜体） */
.grad-text {
  background: linear-gradient(135deg, #2f6fe8, #2563eb);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
}

.btn-primary {
  border-radius: 999px;
  background: linear-gradient(135deg, #2f6fe8, #2563eb);
  color: #ffffff;
  font-size: 15.5px;
  font-weight: 800;
  padding: 15px 32px;
  box-shadow: 0 6px 18px rgba(77, 150, 255, 0.42);
  transition:
    filter 0.2s ease,
    transform 0.2s ease;
}

.btn-primary:hover {
  filter: brightness(1.06);
}

.btn-ghost {
  border-radius: 999px;
  background: #ffffff;
  color: #0f172a;
  border: 1.5px solid #e2e8f0;
  font-size: 15.5px;
  font-weight: 800;
  padding: 15px 26px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.btn-ghost:hover {
  border-color: #c7d9f7;
  background: #f6f9ff;
}

.shot {
  background: #ffffff;
  border: 1px solid #eef2f7;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 22px 48px -12px rgba(15, 23, 42, 0.18);
}
</style>
