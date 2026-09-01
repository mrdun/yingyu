import { HttpException, HttpStatus, Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";

import { course, coursePack, statement } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";
import { ASR_PROVIDER, AsrProvider, WhisperAsrProvider } from "./asr-provider";
import { AudioDto, CoursePackDto, SplitDto, SubtitleDto } from "./dto/ai-content.dto";
import { parseSubtitle, subtitleToText } from "./subtitle-parser";

export interface SplitStatement {
  chinese: string;
  english: string;
  soundmark: string;
  order: number;
}

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";
const DEFAULT_COURSE_SIZE = 10;

const SPLIT_PROMPT = `You are an English teaching content assistant. Split the given English text into natural sentences and translate each one.
Rules:
1. Split by natural sentence boundaries.
2. "english" is the original sentence text.
3. "chinese" is an accurate Chinese translation of the sentence.
4. "soundmark" is the American English phonetic transcription (IPA) of the sentence's key pronunciation; if you are not confident, use an empty string "".
5. "order" starts from 0 and increments by 1 for each sentence.
6. Respond with PURE JSON ONLY — an array of objects with keys chinese, english, soundmark, order. No markdown, no code fences, no explanations.
Text:`;

@Injectable()
export class AiContentService {
  private readonly logger = new Logger(AiContentService.name);

  constructor(
    @Inject(DB) private db: DbType,
    @Optional() @Inject(ASR_PROVIDER) private asrProvider?: AsrProvider,
  ) {}

  async split(dto: SplitDto): Promise<SplitStatement[]> {
    const content = await this.callDeepSeek(dto.title, dto.text);
    return this.parseStatements(content);
  }

  async createCoursePackFromSubtitle(dto: SubtitleDto) {
    const segments = parseSubtitle(dto.subtitle);
    const text = subtitleToText(segments);
    if (!text.trim()) {
      throw new HttpException("字幕内容为空或无法解析", HttpStatus.BAD_REQUEST);
    }
    return await this.createCoursePack({
      title: dto.title,
      description: dto.description,
      text,
      courseSize: dto.courseSize,
    });
  }

  async createCoursePackFromAudio(dto: AudioDto) {
    const provider = this.asrProvider ?? new WhisperAsrProvider();
    const audio = Buffer.from(dto.audioBase64, "base64");

    let transcript: string;
    try {
      transcript = await provider.transcribe(audio, { mimeType: dto.mimeType });
    } catch (error) {
      this.logger.error(`ASR failed: ${error}`);
      throw new HttpException(
        `语音转写失败: ${error instanceof Error ? error.message : "未知错误"}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!transcript.trim()) {
      throw new HttpException("音频转写结果为空", HttpStatus.BAD_REQUEST);
    }

    return await this.createCoursePack({
      title: dto.title,
      description: dto.description,
      text: transcript,
      courseSize: dto.courseSize,
    });
  }

  async createCoursePack(dto: CoursePackDto) {
    const statements = await this.split({ title: dto.title, text: dto.text });
    const courseSize = dto.courseSize ?? DEFAULT_COURSE_SIZE;

    const [coursePackEntity] = await this.db
      .insert(coursePack)
      .values({
        title: dto.title,
        description: dto.description ?? "",
        order: 0,
        isFree: true,
        shareLevel: "public",
        creatorId: "ai-content",
      })
      .returning();

    const courseCount = Math.ceil(statements.length / courseSize);

    for (let i = 0; i < courseCount; i++) {
      const chunk = statements.slice(i * courseSize, (i + 1) * courseSize);
      const [courseEntity] = await this.db
        .insert(course)
        .values({
          title: `${dto.title} - Lesson ${i + 1}`,
          description: dto.description ?? "",
          order: i,
          coursePackId: coursePackEntity.id,
        })
        .returning();

      await this.db.insert(statement).values(
        chunk.map((s) => ({
          order: s.order,
          chinese: s.chinese,
          english: s.english,
          soundmark: s.soundmark ?? "",
          courseId: courseEntity.id,
        })),
      );
    }

    return { coursePackId: coursePackEntity.id, courseCount };
  }

  async findCoursePack(coursePackId: string) {
    return await this.db.query.coursePack.findFirst({
      where: eq(coursePack.id, coursePackId),
      with: {
        courses: {
          orderBy: asc(course.order),
        },
      },
    });
  }

  private async callDeepSeek(title: string, text: string): Promise<string> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new HttpException(
        "DEEPSEEK_API_KEY is not configured",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    let response: Response;
    try {
      response = await fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            { role: "system", content: SPLIT_PROMPT },
            { role: "user", content: `Title: ${title}\n\n${text}` },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
        }),
      });
    } catch (error) {
      this.logger.error(`DeepSeek request failed: ${error}`);
      throw new HttpException("Failed to call DeepSeek API", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      this.logger.error(`DeepSeek API error ${response.status}: ${body}`);
      throw new HttpException(
        `DeepSeek API error: ${response.status}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const data = await response.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new HttpException(
        "DeepSeek returned an unexpected response shape",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return content;
  }

  parseStatements(content: string): SplitStatement[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // DeepSeek sometimes wraps JSON in prose/code fences — extract from first "[" to last "]"
      const start = content.indexOf("[");
      const end = content.lastIndexOf("]");
      if (start === -1 || end === -1 || end <= start) {
        throw new HttpException(
          "Failed to parse DeepSeek response as JSON",
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      try {
        parsed = JSON.parse(content.slice(start, end + 1));
      } catch {
        throw new HttpException(
          "Failed to parse DeepSeek response as JSON",
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }

    // Some models return { statements: [...] } instead of a bare array
    if (parsed && !Array.isArray(parsed) && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const candidate = obj.statements ?? obj.sentences ?? obj.data;
      if (Array.isArray(candidate)) {
        parsed = candidate;
      }
    }

    if (!Array.isArray(parsed)) {
      throw new HttpException(
        "DeepSeek response is not a statement array",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return parsed.map((item, index) => {
      const s = item as Record<string, unknown>;
      return {
        chinese: typeof s.chinese === "string" ? s.chinese : "",
        english: typeof s.english === "string" ? s.english : "",
        soundmark: typeof s.soundmark === "string" ? s.soundmark : "",
        order: typeof s.order === "number" ? s.order : index,
      };
    });
  }
}
