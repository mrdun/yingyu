import { useLogto } from "@logto/vue";
import { useRuntimeConfig } from "nuxt/app";

let logto: ReturnType<typeof useLogto>;
let runtimeConfig: ReturnType<typeof useRuntimeConfig>;
export async function setupAuth() {
  logto = useLogto();
  runtimeConfig = useRuntimeConfig();
}

export async function signIn(callback?: string) {
  callback && setSignInCallback(callback);
  logto.signIn(runtimeConfig.public.signInRedirectURI);
}

export function signOut() {
  return logto.signOut(runtimeConfig.public.signOutRedirectURI);
}

export function isAuthenticated() {
  // Logto 插件可能尚未初始化(渲染早期/插件失败), 此时视为未登录, 避免 TypeError 白屏
  if (!logto) {
    return false;
  }
  return logto.isAuthenticated.value;
}

// 响应式登录态 ref (在 Vue 组件/模板里用 computed 依赖它, 登录态变化时自动重渲染)
export function useAuthState() {
  if (!logto) {
    // 插件未初始化时返回一个稳定的 false ref
    return { isAuthenticated: computed(() => false) };
  }
  return { isAuthenticated: logto.isAuthenticated };
}

export async function getToken() {
  const accessToken = await logto.getAccessToken(runtimeConfig.public.backendEndpoint);

  return accessToken;
}

export function fetchUserInfo() {
  return logto.fetchUserInfo();
}

export function getSignInCallback() {
  let callback = sessionStorage.getItem("callback");
  if (callback) {
    sessionStorage.removeItem("callback");
    return callback;
  } else {
    // 登录成功后默认进入课程商城(工作台), 让左侧导航立即可见
    return "/course-pack";
  }
}

function setSignInCallback(callback: string) {
  sessionStorage.setItem("callback", callback);
}
