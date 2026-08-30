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
    return "/";
  }
}

function setSignInCallback(callback: string) {
  sessionStorage.setItem("callback", callback);
}
