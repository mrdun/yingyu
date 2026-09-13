import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

/**
 * 管理后台的测试有两类:
 *  - 源码级断言 (readFileSync + 断言关键约定): 只需要 node 环境, 与 apps/client 的约定一致。
 *    这类仍是默认环境, 不因为挂了 DOM 环境而变慢。
 *  - 挂载型回归测试 (真实组件 + 真实 DOM): 需要 .vue 能被 import 与 DOM 环境, 由文件顶部
 *    docblock `// @vitest-environment happy-dom` 单独声明 (vitest 支持逐文件环境)。
 *
 * 因此这里只做两件事: 接入 @vitejs/plugin-vue, 把 `~` 指到 apps/admin
 * (与 .nuxt/tsconfig.json 的 `~` -> apps/admin 一致, 组件内部引用 `~/components/...` 才能解析)。
 * test.include 与默认环境都保持原样。
 */
const adminRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "~": adminRoot,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.spec.ts"],
  },
});
