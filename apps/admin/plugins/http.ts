import { defineNuxtPlugin } from "nuxt/app";

import { setupHttp } from "~/api/http";

/**
 * HTTP 客户端初始化。
 * 必须排在 logto 插件之后 (services/auth 需要已经拿到 Logto 上下文)。
 */
export default defineNuxtPlugin(() => {
  setupHttp();
});
