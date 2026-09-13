import type { $Fetch } from "ofetch";

import { useRuntimeConfig } from "nuxt/app";
import { ofetch } from "ofetch";

import { getToken } from "~/services/auth";

/**
 * HTTP 错误: ofetch 默认只 reject 响应体, 会丢掉 HTTP 状态码。
 * 管理后台必须区分 401 (未登录) 与 403 (已登录但无 admin:access 权限):
 * 状态码一旦丢失, 403 就会落到普通的「加载失败」分支, 页面无法给出正确的 Forbidden 提示。
 *
 * 这里统一 reject 一个带状态码的 Error, 与 apps/client/api/http.ts 同一思路 (刻意复制):
 * - `e.status` / `e.statusCode` → 同一个 HTTP 状态码 (兼容两种历史写法)
 * - `e.message` → 后端 message (数组时用 ", " 连接)
 * - `e.data` → 后端原始错误体
 */
export interface ApiError extends Error {
  name: "ApiError";
  /** HTTP 状态码 */
  status: number;
  /** HTTP 状态码 (与 status 相同) */
  statusCode: number;
  /** 后端原始错误体 ({ data, message }) */
  data: unknown;
}

/** ofetch 请求选项 + 管理后台自定义项 */
export interface RequestOptions {
  params?: Record<string, unknown>;
  body?: unknown;
  /** 为 false 时跳过 Authorization (仅用于无鉴权接口, 如 GET /health) */
  auth?: boolean;
  /** 允许调用方覆盖重试次数 (写操作应为 0, 避免重复提交) */
  retry?: number;
}

type InternalFetchOptions = {
  skipAuth?: boolean;
};

/** 后端错误体的 message 可能是字符串, 也可能是校验错误数组 */
function readMessage(body: unknown): string | string[] | undefined {
  if (!body || typeof body !== "object") return undefined;
  const { message } = body as { message?: unknown };
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.map((item) => String(item));
  return undefined;
}

function createApiError(status: number, body: unknown): ApiError {
  const rawMessage = readMessage(body);
  const text = Array.isArray(rawMessage) ? rawMessage.join(", ") : rawMessage;
  const error = new Error(text || `请求失败 (HTTP ${status})`) as ApiError;
  error.name = "ApiError";
  error.status = status;
  error.statusCode = status;
  error.data = body;
  return error;
}

/** 从任意异常里读取 HTTP 状态码 (读不到返回 undefined, 不猜) */
export function getHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  if (typeof candidate.status === "number") return candidate.status;
  if (typeof candidate.statusCode === "number") return candidate.statusCode;
  return undefined;
}

/** 未登录 (需要走 Logto 登录) */
export function isUnauthorized(error: unknown): boolean {
  return getHttpStatus(error) === 401;
}

/** 已登录但无权限 (必须显示 Forbidden, 不能伪装成未登录) */
export function isForbidden(error: unknown): boolean {
  return getHttpStatus(error) === 403;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "请求失败";
}

let http: $Fetch | undefined;

export function setupHttp(): $Fetch {
  if (http) return http;

  const config = useRuntimeConfig();
  const baseURL = config.public.adminApiBaseUrl as string;

  http = ofetch.create({
    baseURL,
    headers: { "Content-Type": "application/json" },
    async onRequest({ options }) {
      const skipAuth = (options as InternalFetchOptions).skipAuth;
      if (skipAuth) return;
      const token = await getToken();
      if (token) {
        options.headers = { ...options.headers, Authorization: `Bearer ${token}` };
      }
    },
    async onResponseError({ response }) {
      // 统一 reject 带状态码的 ApiError (401/403 的区分依赖它)
      return Promise.reject(createApiError(response.status, response._data));
    },
    retry: 1,
    retryDelay: 500,
  });

  return http;
}

/**
 * 取 HTTP 客户端。
 * 懒初始化: 即使某个调用发生在 plugins/http.ts 之前, 也不会抛 "未初始化" 的隐晦错误。
 */
export function getHttp(): $Fetch {
  return http ?? setupHttp();
}
