import type { LearningPathDetail, LearningPathSummary } from "~/types";
import { getHttp } from "./http";

export async function fetchLearningPaths() {
  const http = getHttp();
  return (await http<LearningPathSummary[]>("/learning-path", {
    method: "get",
  })) as LearningPathSummary[];
}

export async function fetchLearningPath(id: string) {
  const http = getHttp();
  return (await http<LearningPathDetail>(`/learning-path/${id}`, {
    method: "get",
  })) as LearningPathDetail;
}
