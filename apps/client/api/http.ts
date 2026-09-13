import type { $Fetch } from "ofetch";

import { useRuntimeConfig } from "#app";
import { ofetch } from "ofetch";

import { getToken } from "~/services/auth";

/**
 * HTTP 错误: ofetch 默认只 reject 响应体, 会丢掉 HTTP 状态码,
 * 而页面用 `e?.status === 401 || e?.statusCode === 401` 判断游客态
 * (见 pages/membership.vue / pages/admin.vue / pages/partner.vue 等)。
 * 状态码丢失会让 401 落到「加载失败」分支, 游客因此看不到会员方案与价格。
 *
 * 这里统一 reject 一个带状态码的 Error, 同时保留旧写法能读到的字段:
 * - `e.message` → 后端 message (字符串; 数组时用 ", " 连接)
 * - `e.data`    → 后端原始错误体, 因此 `e.data.message` 仍可读
 */
export interface HttpStatusError extends Error {
  /** HTTP 状态码 (与 statusCode 相同, 兼容页面的两种写法) */
  status: number;
  /** HTTP 状态码 */
  statusCode: number;
  /** 后端原始错误体 ({ data, message }) */
  data: unknown;
}

/** 后端错误体的 message 可能是字符串, 也可能是校验错误数组 */
function readMessage(body: unknown): string | string[] | undefined {
  if (!body || typeof body !== "object") return undefined;
  const { message } = body as { message?: unknown };
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.map((item) => String(item));
  return undefined;
}

function createHttpStatusError(status: number, body: unknown): HttpStatusError {
  const rawMessage = readMessage(body);
  const text = Array.isArray(rawMessage) ? rawMessage.join(", ") : rawMessage;
  const error = new Error(text || `请求失败 (HTTP ${status})`) as HttpStatusError;
  error.name = "HttpStatusError";
  error.status = status;
  error.statusCode = status;
  error.data = body;
  return error;
}

let http: $Fetch;
export function setupHttp() {
  if (http) return http;

  const config = useRuntimeConfig();
  const baseURL = config.public.apiBase as string;

  http = ofetch.create({
    baseURL,
    headers: { "Content-Type": "application/json" },
    async onRequest({ options }) {
      const token = await getToken();
      options.headers = { ...options.headers, Authorization: `Bearer ${token}` };
    },
    async onResponseError({ response }) {
      const body = response._data;
      const error = createHttpStatusError(response.status, body);
      const message = readMessage(body);
      if (Array.isArray(message)) {
        message.forEach((item) => {
          httpStatusErrorHandler?.(item, response.status);
        });
      } else {
        // 时机与参数不变: 处理器仍收到 (message, statusCode)
        httpStatusErrorHandler?.(error.message, response.status);
      }
      return Promise.reject(error);
    },
    retry: 3,
    retryDelay: 1000,
  });
}

type HttpStatusErrorHandler = (message: string, statusCode: number) => void;
let httpStatusErrorHandler: HttpStatusErrorHandler;

export function injectHttpStatusErrorHandler(handler: HttpStatusErrorHandler) {
  httpStatusErrorHandler = handler;
}

export function getHttp() {
  if (!http) {
    throw new Error("HTTP client not initialized. Call setupHttp first.");
  }
  return http;
}
