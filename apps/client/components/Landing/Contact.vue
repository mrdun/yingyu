<template>
  <footer id="contact">
    <div class="mx-auto max-w-screen-xl space-y-6 px-4 py-16 sm:px-6 lg:space-y-16 lg:px-6">
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div>
          <div class="flex items-center">
            <!--
              品牌标记与页头保持一致 (Navbar 用同一个方块标) ——
              此前这里挂的是位图 logo, 与页头那套并存会让同一页出现两种品牌标记。
              ⚠️ 本文件的守卫会检查这里不出现旧的位图 logo 路径, 注释里也别写出那个字面量。
            -->
            <span
              aria-hidden="true"
              class="mr-6 grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] bg-gradient-to-br from-[#2f6fe8] to-[#2563eb] text-[15px] text-white shadow-[0_4px_12px_rgba(77,150,255,0.4)]"
            >
              🐛
            </span>
            <span class="mt-4 text-3xl">学以致用</span>
          </div>

          <p class="typing mt-4 max-w-[16rem] text-base leading-relaxed">
            一起来加入我们
            <span
              class="bg-gradient-to-r from-purple-400 via-purple-400 to-gray-400 bg-clip-text text-transparent dark:from-purple-600 dark:to-gray-100"
              >学以致用</span
            >!
          </p>
        </div>

        <div class="grid grid-cols-1 gap-6 transition sm:grid-cols-2 lg:col-span-2 lg:grid-cols-4">
          <div>
            <p class="text-lg font-medium">学以致用</p>

            <ul class="mt-6 space-y-4 text-sm">
              <li>
                <a
                  href="#features"
                  class="hover:opacity-80"
                >
                  产品功能
                </a>
              </li>

              <li>
                <a
                  href="#faq"
                  class="hover:opacity-80"
                >
                  常见问题
                </a>
              </li>

              <li>
                <a
                  href="#home"
                  class="hover:opacity-80"
                >
                  开始学习
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p class="text-lg font-medium">支持</p>

            <ul class="mt-6 space-y-4 text-sm">
              <li>
                <a
                  href="#faq"
                  class="hover:opacity-80"
                >
                  联系我们
                </a>
              </li>

              <!-- <li>
                <a
                  href="#faq"
                  class="transition hover:opacity-75"
                >
                  常见问题
                </a>
              </li> -->
            </ul>
          </div>

          <!-- <div>
            <p class="font-medium text-lg">教学</p>

            <ul class="mt-6 space-y-4 text-sm">
              <li>
                <a
                  href="https://github.com/cuixueshe/earthworm"
                  class="transition hover:opacity-75"
                >
                  关于我们
                </a>
              </li>
            </ul>
          </div> -->
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts"></script>

<style scoped>
.icon-link {
  @apply h-6 w-6 self-start;
}

.icon-link-gray {
  @apply text-gray-500 hover:text-black dark:hover:text-gray-300;
}

@keyframes typing {
  from {
    width: 0;
  }
  to {
    width: 100%;
  }
}

@keyframes blink-cursor {
  from,
  to {
    border-color: transparent;
  }
  50% {
    border-color: rgba(228, 110, 255, 0.75);
  }
}

.typing {
  overflow: hidden;
  border-right: 0.25em solid rgba(228, 110, 255, 0.75);
  white-space: nowrap;
  letter-spacing: 0.15em;
  animation:
    typing 3.5s steps(40, end),
    blink-cursor 0.75s step-end infinite;
}
</style>
