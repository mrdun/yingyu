import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";

import { user } from "@earthworm/schema";
import { testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";

describe("users shadow table", () => {
  let db: DbType;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
    }).compile();
    db = module.get<DbType>(DB);
  });

  afterAll(async () => {
    await db.delete(user).where(eq(user.id, "t_shadow_user_1"));
    await db.delete(user).where(eq(user.id, "t_shadow_user_2"));
    await endDB();
  });

  it("inserts and reads a user by Logto id", async () => {
    await db.insert(user).values({
      id: "t_shadow_user_1",
      username: "alice",
      avatarUrl: "https://example.com/a.png",
    });

    const rows = await db.select().from(user).where(eq(user.id, "t_shadow_user_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe("alice");
    expect(rows[0].avatarUrl).toBe("https://example.com/a.png");
  });

  it("uses id as primary key (rejects duplicate)", async () => {
    await db.insert(user).values({ id: "t_shadow_user_2" });
    await expect(db.insert(user).values({ id: "t_shadow_user_2" })).rejects.toThrow();
  });
});
