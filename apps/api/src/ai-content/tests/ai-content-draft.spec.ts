import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";

import { coursePack } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { AiContentService } from "../ai-content.service";

describe("AiContentService createCoursePack (draft)", () => {
  let db: DbType;
  let service: AiContentService;

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
  });

  afterAll(async () => {
    await cleanDB(db);
    await endDB();
  });

  it("creates a draft course pack with source=ai and membership access", async () => {
    jest.spyOn(service, "split").mockResolvedValue([
      { chinese: "你好", english: "Hello.", soundmark: "", order: 0 },
    ]);

    const result = await service.createCoursePack({ title: "test", text: "Hello." });

    const [pack] = await db.select().from(coursePack).where(eq(coursePack.id, result.coursePackId));
    expect(pack.status).toBe("draft");
    expect(pack.source).toBe("ai");
    expect(pack.accessLevel).toBe("membership");
    expect(pack.shareLevel).toBe("private");
  });
});
