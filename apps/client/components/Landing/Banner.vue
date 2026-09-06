<template>
  <section class="relative overflow-hidden bg-cream pb-16 pt-28">
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-[46rem] bg-[radial-gradient(circle_at_top_left,rgba(47,91,234,0.10),transparent_40%),radial-gradient(circle_at_top_right,rgba(182,102,72,0.10),transparent_35%),radial-gradient(circle_at_center,rgba(198,164,88,0.06),transparent_55%)]"
    ></div>

    <div class="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-6 text-center">
      <div
        class="mb-8 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-600 shadow-sm backdrop-blur-md"
      >
        <span class="grid h-6 w-6 place-items-center rounded-lg bg-brand-50 text-brand-600">🎮</span>
        <span>学以致用 · 像玩游戏一样练英语</span>
      </div>

      <h1
        class="font-serif mb-6 text-4xl font-normal leading-[1.15] tracking-tight text-zinc-950 md:text-6xl md:font-bold"
      >
        <span
          class="mb-3 block font-sans text-sm font-semibold uppercase tracking-[0.35em] text-brand-600/80 md:text-base"
        >
          XueYiZhiYong
        </span>
        让你的英语学习
        <br />
        <span
          class="bg-gradient-to-r from-brand-600 via-brand-400 to-brand-300 bg-clip-text pr-2 text-3xl italic text-transparent md:text-5xl"
        >
          上瘾到停不下来
        </span>
      </h1>

      <p class="mb-10 max-w-2xl text-lg leading-relaxed text-zinc-600 md:text-xl">
        通过连词成句、i+1 可理解输入与游戏化闯关，在真实对话实战中快速掌握最纯正的英语表达。
      </p>

      <button
        type="button"
        class="group inline-flex items-center gap-2 rounded-full bg-brand-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-blue-200/60 transition-all hover:scale-105 hover:bg-brand-700"
        @click="handleKeydown"
      >
        开启学习
        <span aria-hidden="true" class="transition-transform group-hover:translate-x-1">→</span>
      </button>

      <div class="mt-16 w-full">
        <img
          alt="学以致用预览"
          src="~/assets/home-page-preview.png"
          class="mx-auto w-4/5 rounded-[1.35rem] border border-zinc-200/70 shadow-soft lg:w-3/4"
        />
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
