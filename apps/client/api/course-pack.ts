import type { CourseApiResponse } from "./course";
import type { CoursePack, CoursePackProgress, CoursePacksItem } from "~/types";
import { getHttp } from "./http";

export type CoursePacksItemApiResponse = {
  id: string;
  title: string;
  isFree: boolean;
  description: string;
  cover: string;
  accessLevel?: "free" | "membership";
  accessible?: boolean;
};

export interface CoursePackApiResponse {
  id: string;
  title: string;
  description: string;
  isFree: boolean;
  cover: string;
  courses: CourseApiResponse[];
  accessLevel?: "free" | "membership";
  accessible?: boolean;
  requiresMembership?: boolean;
}

export async function fetchCoursePacks(params?: { keyword?: string; filter?: string }) {
  const http = getHttp();
  const query = new URLSearchParams();
  if (params?.keyword) query.set("keyword", params.keyword);
  if (params?.filter && params.filter !== "all") query.set("filter", params.filter);
  const qs = query.toString();
  return (await http<CoursePacksItem[]>(`/course-pack${qs ? `?${qs}` : ""}`, {
    method: "get",
  })) as CoursePacksItem[];
}

export async function fetchCoursePack(coursePackId: string) {
  const http = getHttp();
  return (await http<CoursePackApiResponse>(`/course-pack/${coursePackId}`, {
    method: "get",
  })) as CoursePack;
}

export async function fetchCoursePackProgress(coursePackId: string) {
  const http = getHttp();
  return (await http<CoursePackProgress>(`/course-pack/${coursePackId}/progress`, {
    method: "get",
  })) as CoursePackProgress;
}
