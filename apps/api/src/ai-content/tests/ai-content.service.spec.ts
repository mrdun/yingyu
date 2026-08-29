import { HttpException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { DB, DbType } from "../../global/providers/db.provider";
import { AiContentService } from "../ai-content.service";

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
