import type { LogtoConfig } from "@logto/vue";

import { createLogto, UserScope } from "@logto/vue";
import { defineNuxtPlugin, useRuntimeConfig } from "nuxt/app";

import { setupAuth } from "~/services/auth";

export default defineNuxtPlugin((nuxtApp) => {
  const runtimeConfig = useRuntimeConfig();

  const config: LogtoConfig = {
    endpoint: runtimeConfig.public.endpoint,
    appId: runtimeConfig.public.appId,

    /**
     * 只申请用户端真正需要的 scope。
     *
     * 这里**不再**申请 `admin:access`: 管理后台已拆成独立应用 (apps/admin, Logto 应用
     * earthworm-admin), 用户端没有任何页面消费它了。此前的写法会让**每个会员登录都申请管理权限**
     * (Logto 按角色下发, 普通用户拿不到, 但请求本身就是多余的), 拆除后回到干净状态。
     */
    scopes: [
      UserScope.Email,
      UserScope.Phone,
      UserScope.CustomData,
      UserScope.Identities,
      UserScope.Organizations,
    ],
    resources: [runtimeConfig.public.backendEndpoint],
  };

  nuxtApp.vueApp.use(createLogto, config);
  setupAuth();
});
