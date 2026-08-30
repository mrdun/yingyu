import type { CourseApiResponse } from "./course";
import type { CoursePack, CoursePacksItem } from "~/types";
import { getHttp } from "./http";

export type CoursePacksItemApiResponse = {
  id: string;
  title: string;
  isFree: boolean;
  description: string;
  cover: string;
};

export interface CoursePackApiResponse {
  id: string;
  title: string;
  description: string;
  isFree: boolean;
  cover: string;
  courses: CourseApiResponse[];
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
