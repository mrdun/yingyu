import type { $Fetch } from "ofetch";

import { useRuntimeConfig } from "#app";
import { ofetch } from "ofetch";

let anonymousHttp: $Fetch;

// 匿名请求实例：不带 Authorization header，供未登录可访问的接口使用
//（ai-content 后端端点均有 @UncheckAuth() 装饰器）。
// 不复用全局 http，避免影响其它模块的鉴权行为。
export function getAnonymousHttp(): $Fetch {
  if (anonymousHttp) return anonymousHttp;

  const config = useRuntimeConfig();
  const baseURL = config.public.apiBase as string;

  anonymousHttp = ofetch.create({
    baseURL,
    headers: { "Content-Type": "application/json" },
    retry: 0,
    timeout: 5 * 60 * 1000,
  });
  return anonymousHttp;
}

export interface CoursePackResponse {
  coursePackId: string;
  courseCount: number;
}

export interface CreateCoursePackInput {
  title: string;
  description: string;
  text: string;
  courseSize?: number;
}

export async function createCoursePack(input: CreateCoursePackInput) {
  const http = getAnonymousHttp();
  // AI 拆句耗时较长，且 POST 不可重试，避免重复建课
  return (await http<CoursePackResponse>("ai-content/course-pack", {
    method: "post",
    body: input,
  })) as CoursePackResponse;
}

export interface CreateCoursePackFromSubtitleInput {
  title: string;
  description?: string;
  subtitle: string;
  courseSize?: number;
}

export async function createCoursePackFromSubtitle(input: CreateCoursePackFromSubtitleInput) {
  const http = getAnonymousHttp();
  return (await http<CoursePackResponse>("ai-content/subtitle", {
    method: "post",
    body: input,
  })) as CoursePackResponse;
}
