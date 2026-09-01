import { Test } from "@nestjs/testing";

import type { DbType } from "../../global/providers/db.provider";
import { insertPictureWord } from "../../../test/fixture/db";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB } from "../../global/providers/db.provider";
import { PictureWordService } from "../picture-word.service";

describe("PictureWordService", () => {
  let db: DbType;
  let service: PictureWordService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: testImportModules,
      providers: [PictureWordService],
    }).compile();

    db = moduleRef.get<DbType>(DB);
    service = moduleRef.get<PictureWordService>(PictureWordService);
  });

  beforeEach(async () => {
    await cleanDB(db);
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await cleanDB(db);
    await endDB();
  });

  it("按 order 升序返回所有词卡", async () => {
    await insertPictureWord(db, { word: "banana", order: 2 });
    await insertPictureWord(db, { word: "apple", order: 1 });

    const result = await service.findAll();

    expect(result).toHaveLength(2);
    expect(result[0].word).toBe("apple");
    expect(result[1].word).toBe("banana");
  });
});
