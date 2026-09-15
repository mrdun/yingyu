// https://nuxt.com/docs/api/configuration/nuxt-config

/**
 * 构建期门禁: 前端变量是在构建时写进产物的, 缺变量不会报错 —— 而是产出一个
 * runtimeConfig 全空的坏产物 (页面能开, 但登录/课程/会员请求全部打回静态服务)。
 * 这里在 build/generate 前直接失败, 避免"静默交付坏产物"。
 * 变量清单见 PRODUCTION_RELEASE_CHECKLIST.md §2.2.1。
 */
const REQUIRED_BUILD_ENV = [
  "API_BASE",
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
      `前端构建缺少必需环境变量: ${missing.join(", ")}\n` +
        `这些变量会在构建时写进产物, 缺失会产出无法连接后端的坏产物。\n` +
        `请先 export 这些变量再构建 (见 PRODUCTION_RELEASE_CHECKLIST.md §2.2.1); ` +
        `本地 RC 可参考 apps/client/.env 的值。`,
    );
  }
}

const appScripts: any = [];
if (process.env.NODE_ENV === "production") {
  addClarity();
}

// for https://clarity.microsoft.com/
function addClarity() {
  appScripts.push({
    innerHTML: `(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "${process.env.CLARITY}");`,
  });
}

export default defineNuxtConfig({
  ssr: false,
  // default is true, reference to https://nuxt.com/docs/guide/directory-structure/components
  // components: true,
  imports: {
    autoImport: false,
  },
  devtools: {
    enabled: true,
  },
  app: {
    head: {
      title: "学以致用 - 像玩游戏一样，用句子学英语",
      htmlAttrs: {
        lang: "zh-CN",
      },
      meta: [
        {
          name: "description",
          content:
            "学以致用 - 像玩游戏一样，用句子学英语。连词成句、游戏化闯关，让英语学习不再痛苦。",
        },
      ],
      link: [{ rel: "icon", href: "/favicon.ico" }],
      script: appScripts,
    },
  },
  css: ["~/assets/css/globals.css"],
  modules: [
    "@nuxt/ui",
    "@vueuse/nuxt",
    "@nuxt/test-utils/module",
    "@hypernym/nuxt-anime",
    "@nuxt/image",
  ],
  plugins: ["~/plugins/logto.ts", "~/plugins/http.ts"],
  runtimeConfig: {
    public: {
      apiBase: process.env.API_BASE || "",
      endpoint: process.env.LOGTO_ENDPOINT || "",
      appId: process.env.LOGTO_APP_ID || "",
      backendEndpoint: process.env.BACKEND_ENDPOINT || "",
      signInRedirectURI: process.env.LOGTO_SIGN_IN_REDIRECT_URI || "",
      signOutRedirectURI: process.env.LOGTO_SIGN_OUT_REDIRECT_URI || "",
      // 发音音频基址（我们离线生成的 mp3 静态目录 / CDN 地址）。
      // 留空 = 不发自有音频，播放端直接走有道（即改动前的行为），所以它**不是**构建门禁项。
      audioBase: process.env.AUDIO_BASE || "",
    },
  },
  build: {
    transpile: ["vue-sonner"],
  },
});
