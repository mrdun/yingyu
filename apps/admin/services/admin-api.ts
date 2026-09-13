import type { FetchOptions } from "ofetch";

import type { ApiError, RequestOptions } from "~/api/http";
import { getErrorMessage, getHttp, getHttpStatus, isForbidden, isUnauthorized } from "~/api/http";
import type { PageParams } from "~/types/admin";

/**
 * 统一 API 入口 (transport)。
 *
 * 职责: baseURL + token 注入 (api/http.ts) + 错误归一化 + 分页参数归一化。
 * 页面只能调用 services/*.service.ts, 由它们再走这里 —— 页面里禁止出现裸 fetch/$fetch URL。
 * 将来如果要在前端与 NestJS 之间插入 BFF, 只需替换本文件的实现, 页面与各 service 不动。
 *
 * 选项组装: method 收窄成字面量并保持可赋值给 ofetch 的 FetchOptions; skipAuth 是本仓库
 * 自定义项 (api/http.ts 的 onRequest 读取), 不属于 ofetch 的类型 —— 所以下面 4 个函数都先
 * 把选项组装成变量再传给 $fetch, 避免实参位置的对象字面量把 skipAuth 判成「多余属性」。
 */

export type { ApiError, RequestOptions };
export { getErrorMessage, getHttpStatus, isForbidden, isUnauthorized };

/** 网络层失败 (连不上后端/DNS 失败等) 的统一状态码: 0 —— 绝不与 401/403 混淆 */
export const NETWORK_ERROR_STATUS = 0;

/**
 * 错误归一化: 保证调用方拿到的异常一定带数字状态码。
 * 后端返回的错误已由 api/http.ts 转成 ApiError; 这里只兜住网络层异常。
 */
export function normalizeTransportError(error: unknown): ApiError {
  const status = getHttpStatus(error);
  if (typeof status === "number") return error as ApiError;

  const wrapped = new Error(`网络请求失败: ${getErrorMessage(error)}`) as ApiError;
  wrapped.name = "ApiError";
  wrapped.status = NETWORK_ERROR_STATUS;
  wrapped.statusCode = NETWORK_ERROR_STATUS;
  wrapped.data = undefined;
  return wrapped;
}

/** 本仓库统一走 JSON 响应, 对应 $Fetch 调用签名里 R = "json" 的那个具体形态 */
type JsonFetchOptions = FetchOptions<"json">;

/**
 * 组装 $fetch 的请求选项。
 *
 * body 在 RequestOptions 里是 unknown (调用方可以传任意载荷), 这里精确断言成 ofetch 的请求体
 * 类型: 只做类型对齐, 运行时原样透传, 不转换也不过滤任何字段。
 */
function toFetchOptions(options: RequestOptions | undefined, defaultRetry: number) {
  return {
    params: options?.params,
    body: options?.body as JsonFetchOptions["body"],
    skipAuth: options?.auth === false,
    retry: options?.retry ?? defaultRetry,
  };
}

/** GET (读操作允许重试) */
async function get<T>(path: string, options?: RequestOptions): Promise<T> {
  try {
    const requestOptions = { method: "GET", ...toFetchOptions(options, 1) };
    return await getHttp()<T>(path, requestOptions);
  } catch (error) {
    throw normalizeTransportError(error);
  }
}

/** POST (写操作不重试, 避免重复提交) */
async function post<T>(path: string, options?: RequestOptions): Promise<T> {
  try {
    const requestOptions = { method: "POST", ...toFetchOptions(options, 0) };
    return await getHttp()<T>(path, requestOptions);
  } catch (error) {
    throw normalizeTransportError(error);
  }
}

/** PATCH (写操作不重试) */
async function patch<T>(path: string, options?: RequestOptions): Promise<T> {
  try {
    const requestOptions = { method: "PATCH", ...toFetchOptions(options, 0) };
    return await getHttp()<T>(path, requestOptions);
  } catch (error) {
    throw normalizeTransportError(error);
  }
}

/** DELETE (写操作不重试) */
async function remove<T>(path: string, options?: RequestOptions): Promise<T> {
  try {
    const requestOptions = { method: "DELETE", ...toFetchOptions(options, 0) };
    return await getHttp()<T>(path, requestOptions);
  } catch (error) {
    throw normalizeTransportError(error);
  }
}

export const adminApi = { get, post, patch, delete: remove };

/**
 * 分页参数归一化。
 * 后端不同接口的"每页条数"参数名不一致: /admin/users 用 pageSize, /admin/dashboard/orders 用 limit。
 * 这里统一入口, 避免每个页面各写一套 (也避免传 -1 / 0 这类越界值)。
 */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface NormalizedPageParams {
  page: number;
  pageSize: number;
  limit: number;
}

export function normalizePageParams(params: PageParams = {}): NormalizedPageParams {
  const rawPage = Number(params.page ?? 1);
  const rawSize = Number(params.pageSize ?? params.limit ?? DEFAULT_PAGE_SIZE);

  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
  const size = Number.isFinite(rawSize)
    ? Math.min(Math.max(1, Math.floor(rawSize)), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

  return { page, pageSize: size, limit: size };
}

/** 拼路径片段 (id 可能含特殊字符, 必须编码) */
export function pathSegment(value: string): string {
  return encodeURIComponent(String(value));
}
