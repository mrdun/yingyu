// https://nuxt.com/docs/api/configuration/nuxt-config

/**
 * 构建期门禁 (与 apps/client/nuxt.config.ts 同一思路, 刻意复制):
 * Nuxt 的 runtimeConfig.public 是在「构建时」把变量写进产物的。缺变量不会报错,
 * 而是产出一个 runtimeConfig 全空的坏产物 —— 页面能打开, 但登录/接口请求全部失效。
 * 这里在 build/generate 前直接失败, 避免静默交付坏产物。
 */
const REQUIRED_BUILD_ENV = [
  "ADMIN_API_BASE_URL",
  "LOGTO_ENDPOINT",
  "LOGTO_APP_ID",
  "BACKEND_ENDPOINT",
  "LOGTO_SIGN_IN_REDIRECT_URI",
  "LOGTO_SIGN_OUT_REDIRECT_URI",
] as const;

const isBuildCommand = process.argv.some((arg) => arg === "build" || arg === "generate");
if (isBuildCommand) {
  const missing = REQUIRED_BUILD_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `管理后台构建缺少必需环境变量: ${missing.join(", ")}\n` +
        `这些变量会在构建时写进产物, 缺失会产出无法连接后端/无法登录的坏产物。\n` +
        `请先提供它们再构建 (参考 apps/admin/.env.example)。`,
    );
  }
}

/**
 * 管理后台与用户端共用同一套 UI 方案 (Tailwind + daisyUI, 通过 @nuxt/ui 装配 Tailwind,
 * 与 apps/client 完全一致), 不引入 Element Plus / Ant Design 等第二套框架。
 * ssr: false —— 与用户端部署模式一致, 可 nuxt generate 出静态产物。
 */
export default defineNuxtConfig({
  ssr: false,
  imports: {
    // 与用户端一致: 关闭 composables/utils 自动导入, 显式 import 便于静态审查
    autoImport: false,
  },
  devtools: {
    enabled: false,
  },
  app: {
    head: {
      title: "Earthworm 管理后台",
      htmlAttrs: {
        lang: "zh-CN",
      },
      meta: [{ name: "robots", content: "noindex, nofollow" }],
    },
  },
  css: ["~/assets/css/globals.css"],
  modules: ["@nuxt/ui"],
  plugins: ["~/plugins/logto.ts", "~/plugins/http.ts"],
  runtimeConfig: {
    public: {
      adminApiBaseUrl: process.env.ADMIN_API_BASE_URL || "",
      endpoint: process.env.LOGTO_ENDPOINT || "",
      appId: process.env.LOGTO_APP_ID || "",
      backendEndpoint: process.env.BACKEND_ENDPOINT || "",
      signInRedirectURI: process.env.LOGTO_SIGN_IN_REDIRECT_URI || "",
      signOutRedirectURI: process.env.LOGTO_SIGN_OUT_REDIRECT_URI || "",
    },
  },
});
