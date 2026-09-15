import { HttpException, HttpStatus, Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";

import { course, coursePack, statement } from "@earthworm/schema";
import type { GrammarAnnotation } from "./grammar-annotation";
import { DB, DbType } from "../global/providers/db.provider";
import { ASR_PROVIDER, AsrProvider, WhisperAsrProvider } from "./asr-provider";
import { AudioDto, CoursePackDto, SplitDto, SubtitleDto } from "./dto/ai-content.dto";
import {
  buildAnnotationPrompt,
  computeOffsets,
  GRAMMAR_SYSTEM_PROMPT,
  parseAnnotationResponse,
  structureFromPattern,
  validateGrammar,
} from "./grammar-annotation";
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
/** 铁律 3: 一批最多 10 条 —— 给 20+ 条会超 max_tokens, 返回的 JSON 被截断 (实测)。 */
const ANNOTATE_BATCH_SIZE = 10;
/** 有限并发: 20+ 批串行太慢, 全并发会打爆限流。 */
const ANNOTATE_CONCURRENCY = 3;
const ANNOTATE_MAX_TOKENS = 8000;
const ANNOTATE_TEMPERATURE = 0.1;

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

    // 语法标注是加分项: 任何失败都只记日志, 绝不阻断建课 (见 annotateStatements 的三层容错)。
    let annotations = new Map<number, GrammarAnnotation>();
    try {
      annotations = await this.annotateStatements(
        statements.map((s) => ({ order: s.order, english: s.english })),
      );
    } catch (error) {
      this.logger.warn(`语法标注整体失败, 课程将不带标注继续创建: ${error}`);
    }

    // 事务保证: AI 建课要么全部成功, 要么不留下孤儿 draft 脏数据 (绝不产生公开内容)。
    return await this.db.transaction(async (tx) => {
      const [coursePackEntity] = await tx
        .insert(coursePack)
        .values({
          title: dto.title,
          description: dto.description ?? "",
          order: 0,
          isFree: false,
          shareLevel: "private",
          creatorId: "ai-content",
          status: "draft",
          source: "ai",
          accessLevel: "membership",
        })
        .returning();

      const courseCount = Math.ceil(statements.length / courseSize);

      for (let i = 0; i < courseCount; i++) {
        const chunk = statements.slice(i * courseSize, (i + 1) * courseSize);
        const [courseEntity] = await tx
          .insert(course)
          .values({
            title: `${dto.title} - Lesson ${i + 1}`,
            description: dto.description ?? "",
            order: i,
            coursePackId: coursePackEntity.id,
          })
          .returning();

        await tx.insert(statement).values(
          chunk.map((s) => ({
            order: s.order,
            chinese: s.chinese,
            english: s.english,
            soundmark: s.soundmark ?? "",
            courseId: courseEntity.id,
            // 标注失败/校验不过的句子写 null, 句子本身照常入库
            // （写库方式由 statement.grammar 列自己保证存成 jsonb object, 见 packages/schema）
            grammar: annotations.get(s.order) ?? null,
          })),
        );
      }

      return {
        coursePackId: coursePackEntity.id,
        courseCount,
        statementCount: statements.length,
        annotatedCount: annotations.size,
      };
    });
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

  /**
   * 给句子打语法标注 (口径见 grammar-annotation.ts, 规则复刻 scripts/grammar/*)。
   *
   * 三层容错, 目标是「标注可以有缺失, 课程必须有」:
   * 1. 批次级: 某批取模型/解析失败 → 这批句子不带标注, 其余批次照跑;
   * 2. 单条级: 某条校验不过 (E4/E5/E7/E8/E9/E10/E11/E13) → 只丢这条的标注;
   * 3. 整体级: createCoursePack 里再包一层 try/catch, 本方法抛异常也照样建课。
   */
  private async annotateStatements(
    items: { order: number; english: string }[],
  ): Promise<Map<number, GrammarAnnotation>> {
    const annotations = new Map<number, GrammarAnnotation>();
    if (items.length === 0) return annotations;

    const batches: { order: number; english: string }[][] = [];
    for (let i = 0; i < items.length; i += ANNOTATE_BATCH_SIZE) {
      batches.push(items.slice(i, i + ANNOTATE_BATCH_SIZE));
    }

    // 固定 ANNOTATE_CONCURRENCY 个 worker 抢批, 谁空谁取下一批 (有限并发, 不是全并发)
    let nextBatch = 0;
    const worker = async () => {
      while (true) {
        const index = nextBatch++;
        if (index >= batches.length) return;
        await this.annotateBatch(batches[index], annotations);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(ANNOTATE_CONCURRENCY, batches.length) }, () => worker()),
    );

    return annotations;
  }

  /** 单批: 取模型 → 容错解析 → 程序补偏移/结构 → 逐条校验。本方法不抛异常。 */
  private async annotateBatch(
    batch: { order: number; english: string }[],
    annotations: Map<number, GrammarAnnotation>,
  ): Promise<void> {
    const orders = batch.map((item) => item.order);
    try {
      const content = await this.callAnnotateModel(buildAnnotationPrompt(batch));
      const parsed = parseAnnotationResponse(content, orders);

      for (const item of batch) {
        const raw = parsed.get(item.order);
        if (!raw) continue;

        const grammar = this.finalizeGrammar(item.english, raw);
        const errors = validateGrammar(item.english, grammar);
        if (errors.length > 0) {
          this.logger.warn(
            `语法标注不合规, 丢弃该句标注 (order ${item.order}, "${item.english}"): ${errors.join("; ")}`,
          );
          continue;
        }
        annotations.set(item.order, grammar);
      }
    } catch (error) {
      this.logger.warn(`语法标注批次失败, 该批 ${orders.length} 句不带标注: ${error}`);
    }
  }

  /**
   * 程序补两样东西 (都不让模型写):
   * - start/end: computeOffsets 按空白顺序走位算 (铁律 1);
   * - structure: 只由闭集 pattern 按映射表算 (铁律 2)。
   */
  private finalizeGrammar(english: string, grammar: GrammarAnnotation): GrammarAnnotation {
    const withOffsets = computeOffsets(english, grammar);
    return {
      ...withOffsets,
      structure: withOffsets.pattern ? structureFromPattern(withOffsets.pattern) : undefined,
    };
  }

  /**
   * 取模型函数 —— 故意做成 protected 方法而不是构造注入的 token:
   * 本仓测试统一用 jest.spyOn(service, ...) 替换行为 (见 tests/*.spec.ts), 这样单测不需要
   * 额外注册 provider, 也不必改 ai-content.module.ts。生产路径走下面的 callDeepSeekChat。
   */
  protected async callAnnotateModel(prompt: string): Promise<string> {
    return await this.callDeepSeekChat({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: GRAMMAR_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: ANNOTATE_TEMPERATURE,
      max_tokens: ANNOTATE_MAX_TOKENS,
    });
  }

  private async callDeepSeek(title: string, text: string): Promise<string> {
    return await this.callDeepSeekChat({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: SPLIT_PROMPT },
        { role: "user", content: `Title: ${title}\n\n${text}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
  }

  private async callDeepSeekChat(payload: Record<string, unknown>): Promise<string> {
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
        body: JSON.stringify(payload),
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
