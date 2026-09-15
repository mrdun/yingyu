import { Test, TestingModule } from "@nestjs/testing";
import { eq, sql } from "drizzle-orm";

import { course, coursePack, statement } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { AiContentService } from "../ai-content.service";

/**
 * 「语法标注失败绝不能阻断建课」—— 这条是接进 AI 建课管道时最关键的保证:
 * 标注只是加分项, 模型超时/限流/返回垃圾时, 运营**仍然必须**拿到那门课。
 *
 * 这些用例走**真实 DB**（与 ai-content-draft.spec.ts 同一套 helper）:
 * 唯一被替换的是取模型那一层, 所以验的是真实插入路径上 `grammar` 到底写了什么。
 */
describe("AiContentService 语法标注的容错", () => {
  let db: DbType;
  let service: AiContentService;

  /**
   * `callAnnotateModel` 是 protected（为了让单测能替换取模型的那一层）。
   * ⚠️ 不要写 `service as never` —— 那会把 mock 的**期望类型**也变成 never，
   *    `.mockResolvedValue("...")` 会报 TS2345。要用**带签名**的访问器。
   */
  type AnnotateCaller = { callAnnotateModel: (prompt: string) => Promise<string> };
  const caller = () => service as unknown as AnnotateCaller;

  const items = [
    { chinese: "我喜欢这个食物", english: "I like the food", soundmark: "", order: 0 },
    { chinese: "我想要", english: "I want", soundmark: "", order: 1 },
  ];

  /** 一条**合规**的标注（结构与位置都由程序算, 这里只给模型该给的部分）。 */
  const goodAnnotation = {
    order: 0,
    isSentence: true,
    unitType: "sentence",
    pattern: "S + V + O",
    clauseType: "简单句",
    sentenceType: "陈述句",
    tense: "一般现在时",
    keyPoints: ["主语 I + 谓语 like + 宾语 the food"],
    confidence: 0.95,
    words: [
      { text: "I", pos: "代词" },
      { text: "like", pos: "动词" },
      { text: "the", pos: "冠词" },
      { text: "food", pos: "名词" },
    ],
    phrases: [
      { text: "I", role: "主语", roleType: "单词" },
      { text: "like", role: "谓语", roleType: "动词短语" },
      { text: "the food", role: "宾语", roleType: "名词短语" },
    ],
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [AiContentService],
    }).compile();
    db = module.get<DbType>(DB);
    service = module.get<AiContentService>(AiContentService);
  });

  beforeEach(async () => {
    await cleanDB(db);
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanDB(db);
    await endDB();
  });

  async function statementsOf(coursePackId: string) {
    return await db
      .select({ english: statement.english, grammar: statement.grammar })
      .from(statement)
      .innerJoin(course, eq(course.id, statement.courseId))
      .where(eq(course.coursePackId, coursePackId));
  }

  /**
   * 查库里**真实**的 jsonb 类型。
   *
   * ⚠️ 必须用裸 SQL: drizzle 读回来时会把「双编码的 jsonb 字符串」再解析一次，
   *   于是应用侧看着完全正常（对象、字段都在），只有 `jsonb_typeof` 能戳穿它。
   *   真实踩过: 写进去的 grammar 在库里是 `jsonb_typeof = 'string'`，
   *   `grammar->>'structure'` 取不到任何字段，只有 ORM 读回来才对。
   */
  async function grammarJsonbKinds(coursePackId: string): Promise<string[]> {
    const rows = await db.execute(
      sql`select jsonb_typeof(s.grammar) as kind
          from statements s
          join courses c on c.id = s.course_id
          where c.course_pack_id = ${coursePackId} and s.grammar is not null`,
    );
    return (rows as unknown as { kind: string }[]).map((r) => r.kind);
  }

  it("模型正常返回时: grammar 写进库, 结构式由程序算, 偏移可切回原文", async () => {
    jest.spyOn(service, "split").mockResolvedValue(items);
    jest
      .spyOn(caller(), "callAnnotateModel")
      .mockResolvedValue(JSON.stringify({ items: [goodAnnotation] }));

    const result = await service.createCoursePack({ title: "t", text: "x" });

    const rows = await statementsOf(result.coursePackId);
    const withGrammar = rows.filter((r) => r.grammar);
    expect(withGrammar).toHaveLength(1);

    const g = withGrammar[0].grammar!;
    // 结构式**不是**模型给的: 模型只给 pattern, structure 由程序按映射表算
    expect(g.pattern).toBe("S + V + O");
    expect(g.structure).toBe("主语 + 谓语 + 宾语");
    // 偏移由程序算, 且必须能切回原文
    const phrase = g.phrases.find((p) => p.text === "the food")!;
    expect(phrase.start).toBe(7);
    expect(phrase.end).toBe(15);
    expect("I like the food".slice(phrase.start!, phrase.end!)).toBe("the food");
    // ⚠️ 库里必须是 jsonb **object**，不能是双编码字符串（ORM 读回来会被掩盖，所以用裸 SQL 查）
    expect(await grammarJsonbKinds(result.coursePackId)).toEqual(["object"]);
    // 另一句没标到 → grammar 为 null, 但句子照常在
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => !r.grammar)).toHaveLength(1);
  });

  it("取模型直接抛错时: 建课仍然成功, 所有 grammar 为 null", async () => {
    jest.spyOn(service, "split").mockResolvedValue(items);
    jest.spyOn(caller(), "callAnnotateModel").mockRejectedValue(new Error("deepseek 挂了"));

    const result = await service.createCoursePack({ title: "t", text: "x" });

    expect(result.coursePackId).toBeTruthy();
    const [pack] = await db.select().from(coursePack).where(eq(coursePack.id, result.coursePackId));
    expect(pack.status).toBe("draft");
    const rows = await statementsOf(result.coursePackId);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.grammar === null)).toBe(true);
    expect(result.annotatedCount).toBe(0);
  });

  it("模型返回垃圾（非 JSON）时: 建课仍然成功, grammar 为 null", async () => {
    jest.spyOn(service, "split").mockResolvedValue(items);
    jest.spyOn(caller(), "callAnnotateModel").mockResolvedValue("抱歉, 我不能这么做。");

    const result = await service.createCoursePack({ title: "t", text: "x" });

    const [pack] = await db.select().from(coursePack).where(eq(coursePack.id, result.coursePackId));
    expect(pack.status).toBe("draft");
    expect((await statementsOf(result.coursePackId)).every((r) => r.grammar === null)).toBe(true);
  });

  it("模型给的标注不合规（words 拼不出原句）时: 丢弃该条标注, 但建课照旧", async () => {
    jest.spyOn(service, "split").mockResolvedValue(items);
    jest.spyOn(caller(), "callAnnotateModel").mockResolvedValue(
      JSON.stringify({
        items: [{ ...goodAnnotation, words: [{ text: "I", pos: "代词" }] }],
      }),
    );

    const result = await service.createCoursePack({ title: "t", text: "x" });

    const rows = await statementsOf(result.coursePackId);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.grammar === null)).toBe(true);
    expect(result.annotatedCount).toBe(0);
  });

  it("碎片（isSentence=false）也能带标注存下来, 但不含成分", async () => {
    jest.spyOn(service, "split").mockResolvedValue([items[1]]);
    jest.spyOn(caller(), "callAnnotateModel").mockResolvedValue(
      JSON.stringify({
        items: [
          {
            order: 1,
            isSentence: false,
            unitType: "phrase",
            confidence: 0.9,
            words: [
              { text: "I", pos: "代词" },
              { text: "want", pos: "动词" },
            ],
            phrases: [
              { text: "I", role: null, roleType: null },
              { text: "want", role: null, roleType: null },
            ],
          },
        ],
      }),
    );

    const result = await service.createCoursePack({ title: "t", text: "x" });
    const rows = await statementsOf(result.coursePackId);
    expect(rows).toHaveLength(1);
    expect(rows[0].grammar).toBeTruthy();
    expect(rows[0].grammar!.isSentence).toBe(false);
    expect(rows[0].grammar!.phrases.every((p) => p.role === null)).toBe(true);
  });
});
