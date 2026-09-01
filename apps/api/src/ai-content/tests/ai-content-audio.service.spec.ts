import { HttpException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { DB, DbType } from "../../global/providers/db.provider";
import { AiContentService } from "../ai-content.service";
import { ASR_PROVIDER, AsrProvider } from "../asr-provider";

describe("AiContentService.createCoursePackFromAudio", () => {
  let service: AiContentService;
  let mockAsr: jest.Mocked<AsrProvider>;

  beforeEach(async () => {
    mockAsr = { transcribe: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AiContentService,
        { provide: DB, useValue: {} as DbType },
        { provide: ASR_PROVIDER, useValue: mockAsr },
      ],
    }).compile();

    service = moduleRef.get(AiContentService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("把 base64 音频转写后交给 createCoursePack", async () => {
    mockAsr.transcribe.mockResolvedValue("Hello world. How are you?");
    jest
      .spyOn(service, "createCoursePack")
      .mockResolvedValue({ coursePackId: "cp1", courseCount: 1 } as never);

    const result = await service.createCoursePackFromAudio({
      title: "听力课",
      audioBase64: Buffer.from("fake-audio").toString("base64"),
      courseSize: 5,
    });

    expect(mockAsr.transcribe).toHaveBeenCalledTimes(1);
    const calledAudio = mockAsr.transcribe.mock.calls[0][0];
    expect(Buffer.isBuffer(calledAudio)).toBe(true);
    expect(calledAudio.toString()).toBe("fake-audio");

    expect(service.createCoursePack).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "听力课",
        text: "Hello world. How are you?",
        courseSize: 5,
      }),
    );
    expect(result).toEqual({ coursePackId: "cp1", courseCount: 1 });
  });

  it("转写结果为空时抛 400", async () => {
    mockAsr.transcribe.mockResolvedValue("   ");
    await expect(
      service.createCoursePackFromAudio({ title: "t", audioBase64: "eA==" }),
    ).rejects.toThrow(HttpException);
  });

  it("ASR 失败时抛 500", async () => {
    mockAsr.transcribe.mockRejectedValue(new Error("boom"));
    await expect(
      service.createCoursePackFromAudio({ title: "t", audioBase64: "eA==" }),
    ).rejects.toThrow(HttpException);
  });
});
