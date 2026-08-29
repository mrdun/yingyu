import { getHttp } from "./http";

export interface ReviewQueueItem {
  statementId: string;
  chinese: string;
  english: string;
  soundmark: string;
}

export async function fetchReviewToday() {
  const http = getHttp();
  return (await http<ReviewQueueItem[]>(`/review/today`, {
    method: "get",
  })) as ReviewQueueItem[];
}

export async function fetchReviewAnswer(statementId: string, quality: number) {
  const http = getHttp();
  return (await http(`/review/answer`, {
    method: "post",
    body: { statementId, quality },
  })) as unknown;
}

export async function fetchReviewAdd(statementId: string) {
  const http = getHttp();
  return (await http(`/review/add`, {
    method: "post",
    body: { statementId },
  })) as unknown;
}
