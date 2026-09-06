<template>
  <div
    class="mt-16 w-full flex-col"
    id="what"
  >
    <CommonTitle
      title="什么是学以致用？"
      :description="['像玩游戏一样，用句子学英语。']"
    />
    <section class="flex w-full flex-col justify-center gap-8 py-8 md:flex-row">
      <div
        class="flex w-full flex-shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-soft md:h-[360px] md:w-[45%]"
      >
        <div
          class="hide-scrollbar h-[96%] w-[97%] overflow-y-auto overflow-x-hidden rounded-xl border border-zinc-100 px-5 py-4"
        >
          <h2 class="mb-3 rounded-lg bg-brand-50 py-4 text-center text-xl font-bold text-brand-700">
            快速上手
          </h2>
          <h3 class="pb-2 text-base font-semibold text-zinc-900">当前页面</h3>
          <p class="py-1 text-zinc-600">
            点击按钮
            <span class="mx-1 inline-block rounded-lg border border-solid border-brand-300 px-1 text-brand-600">
              Get Started
            </span>
            <span class="text-zinc-400">（或快捷键 Enter ⏎）</span>
            开启你的第一节课！
          </p>
          <h3 class="py-2 text-base font-semibold text-zinc-900">答题页面</h3>
          <p class="py-1 leading-7 text-zinc-600">
            看到
            <span class="text-brand-600">蓝色下划线</span>
            亮起，输入单词，按下空格键
            <span class="text-zinc-400">（Space ␣）</span>
            向后切换单词，待输入完成后再按下回车键
            <span class="text-zinc-400">（Enter ⏎）</span>
            来提交题目
          </p>
          <p class="py-1 leading-7 text-zinc-600">
            题目提交后若出现
            <span class="text-red-500">红色</span>
            单词和下划线显示，代表这部分单词存在某些错误需要更正，此时可按下空格键
            <span class="text-zinc-400">（Space ␣）</span>
            快速定位到第一个错误单词并清空，完成更改后再按一次空格继续定位到下个错词
          </p>
          <p class="py-1 leading-7 text-zinc-600">
            此时若发现上个错词未正确修改，可按下退格键
            <span class="text-zinc-400">（Backspace ⌫）</span>
            来回退到上一个错词，直到所有错词被更正完成，按下回车键提交即可
          </p>
          <p class="py-1 leading-7 text-zinc-600">
            验证通过后会显示答案页面，同时会播放对应题目语音用于辅助记忆。
          </p>
          <h3 class="py-2 text-base font-semibold text-zinc-900">答题小技巧</h3>
          <p class="py-1 leading-7 text-zinc-600">
            底部提示面板的按钮
            <a
              class="ml-1 text-brand-600 hover:text-brand-700"
              href="https://www.bilibili.com/video/BV1py421q7Mp/"
            >
              👉 一分钟点我快速了解</a
            >
          </p>
          <p class="p-1">
            <button class="instruction-btn">⌃ Ctrl+'</button>
            <span class="text-zinc-400">（或快捷键 Ctrl+'）</span>
            播放题目语音
          </p>
          <p class="p-1">
            <button class="instruction-btn">⌃ Ctrl+;</button>
            <span class="text-zinc-400">（或快捷键 Ctrl+;）</span>
            显示题目答案
          </p>
          <h3 class="py-2 text-base font-semibold text-zinc-900">答案页面</h3>
          <p class="py-1 text-zinc-600">答案下方的按钮</p>
          <p class="py-1">
            <button class="instruction-btn">again</button>
            <span class="text-zinc-400">（或快捷键 Ctrl+;）</span>
            再来亿次，怎能不会！
          </p>
          <p class="py-1">
            <button class="instruction-btn">next</button>
            <span class="text-zinc-400">（或快捷键 Enter）</span>
            下一题，冲冲冲霸占榜首！🏄‍♂️
          </p>

          <h2 class="py-4 text-xl font-bold text-zinc-900">帮助</h2>
          <h3 class="pb-2 text-base font-semibold text-zinc-900">课程页面</h3>
          <p class="py-1 leading-7 text-zinc-600">
            输入下划线全是灰色，没有
            <span class="text-brand-600">蓝色</span>
            亮起时无法输入，需要你动动小手移动鼠标点击输入框进行聚焦哦~
          </p>
          <h3 class="py-2 text-base font-semibold text-zinc-900">用户设置页面</h3>
          <p class="py-1 leading-7 text-zinc-600">
            右上角图标进入 User Info
            切换到设置页面，自定义你喜欢的快捷键，也可以控制语音是否自动播放、单词下划线固定长度、使用空格提交等等……更多个人设置会持续更新
            😊
            <i class="mx-2 inline h-8 w-1 animate-wink bg-brand-600 p-[2px] text-sm"></i>
          </p>
        </div>
      </div>
      <div
        class="flex w-full flex-shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-soft md:h-[360px] md:w-[45%]"
      >
        <div
          class="hide-scrollbar h-[96%] w-[97%] overflow-y-auto overflow-x-hidden rounded-xl border border-zinc-100 px-5 py-4"
        >
          <h2 class="mb-3 rounded-lg bg-brand-50 py-4 text-center text-xl font-bold text-brand-700">
            学习原理：通过连词造句的方法来练习英语 😄
          </h2>
          <h3 class="pb-2 text-base font-semibold text-zinc-900">以句子为核心</h3>
          <p class="py-1 text-zinc-600">每个句子包含单词/词组/语法，所以学会一个句子后，就可以清晰地表达出来。</p>
          <h3 class="py-2 text-base font-semibold text-zinc-900">任务拆分</h3>
          <p class="py-1 leading-7 text-zinc-600">将一个长难句拆分成一个个的小单元（单词/词组）</p>
          <h3 class="py-2 text-base font-semibold text-zinc-900">重复</h3>
          <p class="py-1 leading-7 text-zinc-600">通过不断地重复来形成肌肉记忆</p>
          <h3 class="py-2 text-base font-semibold text-zinc-900">i+1</h3>
          <p class="py-1 leading-7 text-zinc-600">循序渐进的增加难度，先从最简单的句型开始，再到更加丰富的概念</p>
          <h3 class="pb-2 text-base font-semibold text-zinc-900">正向反馈来的快</h3>
          <p class="py-1 leading-7 text-zinc-600">
            当自己可以写出长难句时，会非常有成就感，所以也会越学越想学。打破了传统且非常痛苦的英语学习方案
            ——背单词（还记得 abandon 吗？ oh 不，现在是 aback 了）
          </p>
        </div>
      </div>
    </section>
  </div>
  <CommonDivider />
</template>

<script setup lang="ts"></script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar::-webkit-scrollbar-track {
  background-color: transparent;
}

.hide-scrollbar::-webkit-scrollbar-thumb {
  background-color: transparent;
}

.instruction-btn {
  @apply mr-1 inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-xs text-zinc-700;
}
</style>
