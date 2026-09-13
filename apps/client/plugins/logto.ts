import type { LogtoConfig } from "@logto/vue";

import { createLogto, UserScope } from "@logto/vue";
import { defineNuxtPlugin, useRuntimeConfig } from "nuxt/app";

import { setupAuth } from "~/services/auth";

/**
 * 后端 API 权限 scope (定义在 Logto 资源 earthworm-api 上)。
 * Logto 按角色下发: 只有拥有 default:admin 角色的用户才会真正拿到它,
 * 普通用户请求了也拿不到 —— 权限边界仍由角色保证。
 * 必须在此声明的原因是 @logto/client 的 getAccessToken 不支持按需申请 scope,
 * 只能通过初始化时的 LogtoConfig.scopes 声明。加上它, 管理员后台 /admin/* 才可用。
 */
const ADMIN_ACCESS_SCOPE = "admin:access";

export default defineNuxtPlugin((nuxtApp) => {
  const runtimeConfig = useRuntimeConfig();

  const config: LogtoConfig = {
    endpoint: runtimeConfig.public.endpoint,
    appId: runtimeConfig.public.appId,

    scopes: [
      UserScope.Email,
      UserScope.Phone,
      UserScope.CustomData,
      UserScope.Identities,
      UserScope.Organizations,
      ADMIN_ACCESS_SCOPE,
    ],
    resources: [runtimeConfig.public.backendEndpoint],
  };

  nuxtApp.vueApp.use(createLogto, config);
  setupAuth();
});
