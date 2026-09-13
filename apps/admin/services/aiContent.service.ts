import type { AiCoursePackResult, AiSplitStatement } from "~/types/admin";

import { adminApi } from "./admin-api";

/**
 * AI 内容生成 (前端入口)。
 *
 * 接口 (后端 @UseGuards(AdminOrDevGuard) + @Permissions("admin:access")):
 *  - POST /ai-content/split       文本拆句 —— **只预览, 不落库**
 *  - POST /ai-content/course-pack 文本建课包
 *  - POST /ai-content/subtitle    字幕建课包
 *  - POST /ai-content/audio       音频建课包 (base64)
 *
 * 硬约束 (页面与 service 都不得绕过): 三个建课接口在**后端事务内**写入
 * status="draft" + source="ai", 之后只能走「提交审核 → 发布」的既有状态机。
 * 管理后台不提供"建完即发布"的路径, 也不改 AI 服务的任何行为。
 */

export interface SplitStatementsInput {
  title: string;
  text: string;
}

export interface CreateCoursePackFromTextInput {
  title: string;
  description?: string;
  text: string;
  /** 每课句数, 正整数; 省略时后端使用默认值 */
  courseSize?: number;
}

export interface CreateCoursePackFromSubtitleInput {
  title: string;
  description?: string;
  subtitle: string;
  courseSize?: number;
}

export interface CreateCoursePackFromAudioInput {
  title: string;
  description?: string;
  /** 纯 base64 (不含 "data:...;base64," 前缀) */
  audioBase64: string;
  mimeType?: string;
  courseSize?: number;
}

/** 文本拆句预览 (不落库, 不产生任何课程包) */
export function splitStatements(input: SplitStatementsInput): Promise<AiSplitStatement[]> {
  return adminApi.post<AiSplitStatement[]>("/ai-content/split", { body: input });
}

/** 文本建课包 → 返回 coursePackId (后端已写成 draft + source=ai) */
export function createAiCoursePackFromText(
  input: CreateCoursePackFromTextInput,
): Promise<AiCoursePackResult> {
  return adminApi.post<AiCoursePackResult>("/ai-content/course-pack", { body: input });
}

/** 字幕建课包 (.srt/.vtt 全文) → 后端解析字幕后转文本再建课 */
export function createAiCoursePackFromSubtitle(
  input: CreateCoursePackFromSubtitleInput,
): Promise<AiCoursePackResult> {
  return adminApi.post<AiCoursePackResult>("/ai-content/subtitle", { body: input });
}

/** 音频建课包 (base64) → 后端 ASR 转写后建课 */
export function createAiCoursePackFromAudio(
  input: CreateCoursePackFromAudioInput,
): Promise<AiCoursePackResult> {
  return adminApi.post<AiCoursePackResult>("/ai-content/audio", { body: input });
}
