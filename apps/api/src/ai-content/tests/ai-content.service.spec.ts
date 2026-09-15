import { HttpException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { course, coursePack, statement } from "@earthworm/schema";
import type { SplitStatement } from "../ai-content.service";
import { DB, DbType } from "../../global/providers/db.provider";
import { AiContentService } from "../ai-content.service";
import { type GrammarAnnotation } from "../grammar-annotation";

function deepSeekResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
    }),
  };
}

describe("ai-content service (split JSON parsing)", () => {
  let service: AiContentService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AiContentService, { provide: DB, useValue: {} as DbType }],
    }).compile();

    service = moduleRef.get(AiContentService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("parses a pure JSON array response", () => {
    const content = JSON.stringify([
      { chinese: "你好", english: "Hello.", soundmark: "həˈloʊ", order: 0 },
    ]);
    const result = service.parseStatements(content);
    expect(result).toEqual([{ chinese: "你好", english: "Hello.", soundmark: "həˈloʊ", order: 0 }]);
  });

  it("extracts JSON wrapped in markdown code fences and prose", () => {
    const content = `Sure! Here is the result:\n\`\`\`json\n[{"chinese":"天是蓝的","english":"The sky is blue.","soundmark":"","order":0}]\n\`\`\`\nHope this helps.`;
    const result = service.parseStatements(content);
    expect(result).toHaveLength(1);
    expect(result[0].english).toBe("The sky is blue.");
  });

  it("extracts from the first '[' to the last ']' with trailing prose", () => {
    const content = `Here is the split result: [{"chinese":"跑","english":"Run.","soundmark":"","order":0}] — let me know if you need more.`;
    const result = service.parseStatements(content);
    expect(result).toHaveLength(1);
    expect(result[0].english).toBe("Run.");
  });

  it("unwraps an object with a statements array", () => {
    const content = JSON.stringify({
      statements: [{ chinese: "好", english: "OK.", soundmark: "", order: 0 }],
    });
    const result = service.parseStatements(content);
    expect(result).toHaveLength(1);
    expect(result[0].english).toBe("OK.");
  });

  it("fills missing order with the index and defaults soundmark to empty string", () => {
    const content = JSON.stringify([
      { chinese: "一", english: "One." },
      { chinese: "二", english: "Two.", order: 5 },
    ]);
    const result = service.parseStatements(content);
    expect(result[0].order).toBe(0);
    expect(result[0].soundmark).toBe("");
    expect(result[1].order).toBe(5);
  });

  it("throws HttpException 500 when no JSON array can be extracted", () => {
    expect(() => service.parseStatements("the model refused to answer")).toThrow(HttpException);
    try {
      service.parseStatements("no json here");
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(500);
    }
  });

  it("throws HttpException 500 when the extracted substring is not valid JSON", () => {
    expect(() => service.parseStatements("[broken json")).toThrow(HttpException);
  });

  it("split() propagates parse failures from the DeepSeek content", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(deepSeekResponse("not a json response") as unknown as Response);
    process.env.DEEPSEEK_API_KEY = "test-key";
    await expect(service.split({ title: "t", text: "text" })).rejects.toThrow(HttpException);
  });

  it("split() returns statements when DeepSeek returns valid JSON", async () => {
    const valid = JSON.stringify([{ chinese: "你好", english: "Hello.", soundmark: "", order: 0 }]);
    jest.spyOn(global, "fetch").mockResolvedValue(deepSeekResponse(valid) as unknown as Response);
    process.env.DEEPSEEK_API_KEY = "test-key";
    const result = await service.split({ title: "t", text: "Hello." });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      chinese: "你好",
      english: "Hello.",
      soundmark: "",
      order: 0,
    });
  });

  it("split() throws when DEEPSEEK_API_KEY is missing", async () => {
    const original = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    try {
      await expect(service.split({ title: "t", text: "text" })).rejects.toThrow(HttpException);
    } finally {
      process.env.DEEPSEEK_API_KEY = original;
    }
  });
});

/**
 * 语法标注接入建课链路的测试。取模型函数 (callAnnotateModel) 用子类覆盖, 不碰网络,
 * 这样也不用注册额外的 provider —— 生产路径不受影响。
 */
type InsertedStatement = { order: number; english: string; grammar: GrammarAnnotation | null };

class StubAiContentService extends AiContentService {
  private readonly stubStatements: SplitStatement[];
  private readonly annotationCaller: (prompt: string) => Promise<string>;

  constructor(
    db: DbType,
    stubStatements: SplitStatement[],
    annotationCaller: (prompt: string) => Promise<string>,
  ) {
    super(db);
    this.stubStatements = stubStatements;
    this.annotationCaller = annotationCaller;
  }

  async split(): Promise<SplitStatement[]> {
    return this.stubStatements;
  }

  protected async callAnnotateModel(prompt: string): Promise<string> {
    return await this.annotationCaller(prompt);
  }
}

function createMockDb() {
  const insertedStatements: InsertedStatement[] = [];
  let courseId = 0;

  const tx = {
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        if (table === statement) {
          insertedStatements.push(...(values as InsertedStatement[]));
        }
        return {
          returning: async () => [{ id: table === coursePack ? "pack-1" : `course-${++courseId}` }],
          // statements 的插入结果是被直接 await 的 (没有 .returning())
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve([]).then(resolve, reject),
        };
      },
    }),
  };

  const db = {
    transaction: async (run: (tx: unknown) => Promise<unknown>) => await run(tx),
  };

  return { db: db as unknown as DbType, insertedStatements };
}

function stubStatement(order: number, english: string): SplitStatement {
  return { order, english, chinese: `中文${order}`, soundmark: "" };
}

/** 造一条合规标注 (words/phrases 由 english 切出来, 保证拼接能还原原句)。 */
function annotationPayload(order: number, english: string, pattern = "S + V + O") {
  const words = english
    .split(" ")
    .map((text, index) => ({ text, pos: index === 0 ? "代词" : index === 1 ? "动词" : "名词" }));
  return {
    order,
    isSentence: true,
    unitType: "sentence",
    pattern,
    clauseType: "简单句",
    sentenceType: "陈述句",
    tense: "一般现在时",
    confidence: 0.9,
    words,
    phrases: [
      { text: words[0].text, role: "主语", roleType: "单词" },
      { text: words[1].text, role: "谓语", roleType: "动词短语" },
      {
        text: words
          .slice(2)
          .map((word) => word.text)
          .join(" "),
        role: "宾语",
        roleType: "名词短语",
      },
    ],
  };
}

/** 从 buildAnnotationPrompt 造出的 user message 里取回该批的 items。 */
function parsePromptItems(prompt: string): { order: number; english: string }[] {
  return JSON.parse(prompt.slice(prompt.indexOf("["), prompt.lastIndexOf("]") + 1));
}

function respondWithAnnotations(prompt: string): string {
  const items = parsePromptItems(prompt);
  return JSON.stringify({
    items: items.map((item) => annotationPayload(item.order, item.english)),
  });
}

describe("AiContentService.createCoursePack (语法标注)", () => {
  it("取模型函数总是抛错时: 建课照常成功, 所有语句 grammar 为 null", async () => {
    const { db, insertedStatements } = createMockDb();
    const service = new StubAiContentService(
      db,
      [stubStatement(0, "I like the food"), stubStatement(1, "You need the time")],
      async () => {
        throw new Error("DeepSeek 挂了");
      },
    );

    const result = await service.createCoursePack({ title: "语法测试课", text: "随便" });

    expect(result).toEqual({
      coursePackId: "pack-1",
      courseCount: 1,
      statementCount: 2,
      annotatedCount: 0,
    });
    expect(insertedStatements.length).toBe(2);
    expect(insertedStatements.every((row) => row.grammar === null)).toBe(true);
  });

  it("标注成功时: grammar 落库, start/end 与 structure 都由程序算", async () => {
    const { db, insertedStatements } = createMockDb();
    const service = new StubAiContentService(
      db,
      [stubStatement(0, "I like the food")],
      async (prompt) => respondWithAnnotations(prompt),
    );

    const result = await service.createCoursePack({ title: "语法测试课", text: "随便" });

    expect(result.annotatedCount).toBe(1);
    const [row] = insertedStatements;
    const english = "I like the food";
    expect(row.grammar.isSentence).toBe(true);
    expect(row.grammar.pattern).toBe("S + V + O");
    expect(row.grammar.structure).toBe("主语 + 谓语 + 宾语");
    expect([row.grammar.phrases[2].start, row.grammar.phrases[2].end]).toEqual([7, 15]);
    expect(
      row.grammar.words.every((word) => english.slice(word.start, word.end) === word.text),
    ).toBe(true);
  });

  it("单条校验不过: 只丢这一条的标注, 同批其它句照常", async () => {
    const { db, insertedStatements } = createMockDb();
    const service = new StubAiContentService(
      db,
      [stubStatement(0, "I like the food"), stubStatement(1, "You need the time")],
      async (prompt) =>
        JSON.stringify({
          items: parsePromptItems(prompt).map((item) =>
            // 第一条给一个闭集外的 pattern (自造符号) → 校验不过
            item.order === 0
              ? annotationPayload(item.order, item.english, "S + V + Predicative")
              : annotationPayload(item.order, item.english),
          ),
        }),
    );

    const result = await service.createCoursePack({ title: "语法测试课", text: "随便" });

    expect(result.annotatedCount).toBe(1);
    expect(insertedStatements.find((row) => row.order === 0).grammar).toBeNull();
    expect(insertedStatements.find((row) => row.order === 1).grammar.structure).toBe(
      "主语 + 谓语 + 宾语",
    );
  });

  it("某批响应解析不出来: 只丢这一批的标注, 其余批次照常", async () => {
    const { db, insertedStatements } = createMockDb();
    const statements = Array.from({ length: 12 }, (_, index) =>
      stubStatement(index, `I like item${index}`),
    );

    const service = new StubAiContentService(db, statements, async (prompt) => {
      const items = parsePromptItems(prompt);
      // 第一批 (order 0-9) 返回一段不可解析的散文 → 这 10 条没有标注
      return items[0].order < 10 ? "模型开始胡说八道了" : respondWithAnnotations(prompt);
    });

    const result = await service.createCoursePack({ title: "语法测试课", text: "随便" });

    expect(result.annotatedCount).toBe(2);
    expect(insertedStatements.length).toBe(12);
    expect(insertedStatements.filter((row) => row.grammar === null).length).toBe(10);
  });

  it("每批最多 10 条, 并发不超过 3", async () => {
    const { db, insertedStatements } = createMockDb();
    const statements = Array.from({ length: 40 }, (_, index) =>
      stubStatement(index, `I like item${index}`),
    );
    const batchSizes: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;

    const service = new StubAiContentService(db, statements, async (prompt) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      batchSizes.push(parsePromptItems(prompt).length);
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight -= 1;
      return respondWithAnnotations(prompt);
    });

    const result = await service.createCoursePack({ title: "语法测试课", text: "随便" });

    expect(batchSizes).toEqual([10, 10, 10, 10]);
    expect(maxInFlight).toBe(3);
    expect(result.annotatedCount).toBe(40);
    expect(insertedStatements.every((row) => row.grammar !== null)).toBe(true);
  });
});
