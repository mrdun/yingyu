import { getHttp } from "./http";

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
  const http = getHttp();
  // AI 拆句耗时较长，且 POST 不可重试，避免重复建课
  return (await http<CoursePackResponse>("ai-content/course-pack", {
    method: "post",
    body: input,
    retry: 0,
    timeout: 5 * 60 * 1000,
  })) as CoursePackResponse;
}
