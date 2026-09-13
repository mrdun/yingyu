import type { LogtoConfig } from "@logto/vue";

import { createLogto, UserScope } from "@logto/vue";
import { defineNuxtPlugin, useRuntimeConfig } from "nuxt/app";

import { setupAuth } from "~/services/auth";

/**
 * 后端 API 权限 scope (定义在 Logto 资源 earthworm-api 上)。
 * Logto 按角色下发: 只有拥有 default:admin 角色的用户才会真正拿到它,
 * 普通用户即使请求了也拿不到 —— 权限边界仍由角色 + 后端 AuthGuard 保证。
 * 必须在这里声明的原因: @logto/client 的 getAccessToken 不支持按需申请 scope,
 * 只能通过初始化时的 LogtoConfig.scopes 声明。
 *
 * 管理后台与用户端共用同一个 Logto SPA 应用 (earthworm-client), 不新建应用。
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
      ADMIN_ACCESS_SCOPE,
    ],
    resources: [runtimeConfig.public.backendEndpoint],
  };

  nuxtApp.vueApp.use(createLogto, config);
  setupAuth();
});
