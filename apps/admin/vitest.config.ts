import { defineConfig } from "vitest/config";

/**
 * 管理后台的自动化测试以「源码级断言」为主 (.vue 无法直接 import):
 * 用 readFileSync 读文件 + 断言关键约定, 与 apps/client 的测试约定保持一致。
 * 因此只需要 node 环境, 不需要 nuxt 测试环境。
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.spec.ts"],
  },
});
