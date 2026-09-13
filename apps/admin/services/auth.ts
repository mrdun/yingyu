import { useLogto } from "@logto/vue";
import { useRuntimeConfig } from "nuxt/app";
import { computed } from "vue";

/**
 * 管理后台的 Logto 封装 (参考 apps/client/services/auth.ts, 刻意复刻一份)。
 *
 * 复用同一个 Logto SPA 应用 (earthworm-client), 不新建应用、不改 Logto 配置;
 * 管理后台额外要求 admin:access scope (定义在 Logto 资源 earthworm-api 上, 见 plugins/logto.ts)。
 */

type LogtoContext = ReturnType<typeof useLogto>;

let logto: LogtoContext | undefined;
let runtimeConfig: ReturnType<typeof useRuntimeConfig> | undefined;

/** 登录后要回到的路径 (存 sessionStorage, 跨 Logto 跳转保留) */
const CALLBACK_KEY = "admin:callback";
/** 默认落地页 */
const DEFAULT_CALLBACK = "/dashboard";

/** Logto 初始化是异步的, 守卫需要等待它落定, 否则会把已登录用户误判成游客 */
const AUTH_READY_TIMEOUT_MS = 2000;
const AUTH_READY_POLL_MS = 25;

export function setupAuth(): void {
  logto = useLogto();
  runtimeConfig = useRuntimeConfig();
}

export function isAuthenticated(): boolean {
  // 插件可能尚未初始化 (渲染早期/插件失败), 此时视为未登录, 避免 TypeError 白屏
  if (!logto) return false;
  return logto.isAuthenticated.value;
}

/** 响应式登录态 (模板里用 computed 依赖它, 登录态变化时自动重渲染) */
export function useAuthState() {
  if (!logto) {
    return { isAuthenticated: computed(() => false) };
  }
  return { isAuthenticated: logto.isAuthenticated };
}

/**
 * 等待 Logto 完成初始化, 返回最终登录态。
 * @logto/vue 在启动时会先从存储里恢复会话, 期间 isAuthenticated 仍是 false;
 * 守卫若直接读它就会把已登录用户踢去登录页 (甚至形成登录循环)。
 */
export async function waitForAuthReady(timeoutMs = AUTH_READY_TIMEOUT_MS): Promise<boolean> {
  if (!logto) return false;

  // isLoading 是 @logto/vue 的既有字段; 这里做防御性读取, 缺失时按"已就绪"处理
  const loading = (logto as { isLoading?: { value: boolean } }).isLoading;
  if (!loading || loading.value === false) return isAuthenticated();

  const deadline = Date.now() + timeoutMs;
  while (loading.value === true && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, AUTH_READY_POLL_MS));
  }
  return isAuthenticated();
}

export function signIn(callback?: string): void {
  if (!logto || !runtimeConfig) {
    throw new Error("Logto 尚未初始化, 无法发起登录");
  }
  setSignInCallback(callback);
  logto.signIn(runtimeConfig.public.signInRedirectURI);
}

export function signOut(): void {
  if (!logto || !runtimeConfig) return;
  sessionStorage.removeItem(CALLBACK_KEY);
  logto.signOut(runtimeConfig.public.signOutRedirectURI);
}

export async function getToken(): Promise<string | undefined> {
  // 无鉴权接口 (/health) 不需要 token; 未登录时也不应抛异常中断请求
  if (!logto || !runtimeConfig) return undefined;
  try {
    return await logto.getAccessToken(runtimeConfig.public.backendEndpoint);
  } catch {
    return undefined;
  }
}

export function fetchUserInfo() {
  if (!logto) return Promise.resolve(undefined);
  return logto.fetchUserInfo();
}

export function getSignInCallback(): string {
  const callback = sessionStorage.getItem(CALLBACK_KEY);
  if (callback) {
    sessionStorage.removeItem(CALLBACK_KEY);
    return callback;
  }
  return DEFAULT_CALLBACK;
}

function setSignInCallback(callback?: string): void {
  if (!callback) return;
  sessionStorage.setItem(CALLBACK_KEY, callback);
}
