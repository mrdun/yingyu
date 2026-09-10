import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";

import { user } from "@earthworm/schema";
import { testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import { LogtoService } from "../../logto/logto.service";
import { MembershipService } from "../../membership/membership.service";
import { UserCourseProgressService } from "../../user-course-progress/user-course-progress.service";
import { UserService } from "../user.service";

describe("UserService.syncShadowUser", () => {
  let db: DbType;
  let service: UserService;
  const logtoGet = jest.fn();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: testImportModules,
      providers: [
        UserService,
        { provide: LogtoService, useValue: { logtoApi: { get: logtoGet } } },
        { provide: UserCourseProgressService, useValue: {} },
        { provide: MembershipService, useValue: {} },
      ],
    }).compile();

    db = module.get<DbType>(DB);
    service = module.get<UserService>(UserService);
  });

  afterAll(async () => {
    for (const id of ["t_sync_1", "t_sync_2", "t_sync_3"]) {
      await db.delete(user).where(eq(user.id, id));
    }
    await endDB();
  });

  it("creates a shadow user on first login", async () => {
    logtoGet.mockResolvedValueOnce({
      data: { username: "alice", avatar: "https://example.com/a.png" },
    });

    await service.syncShadowUser("t_sync_1");

    const rows = await db.select().from(user).where(eq(user.id, "t_sync_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe("alice");
    expect(rows[0].avatarUrl).toBe("https://example.com/a.png");
  });

  it("updates an existing shadow user without creating duplicates", async () => {
    await db.insert(user).values({ id: "t_sync_2", username: "old", avatarUrl: "old.png" });
    logtoGet.mockResolvedValueOnce({
      data: { username: "new", avatar: "https://example.com/new.png" },
    });

    await service.syncShadowUser("t_sync_2");

    const rows = await db.select().from(user).where(eq(user.id, "t_sync_2"));
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe("new");
    expect(rows[0].avatarUrl).toBe("https://example.com/new.png");
  });

  it("enforces unique primary key on id", async () => {
    await db.insert(user).values({ id: "t_sync_3" });
    await expect(db.insert(user).values({ id: "t_sync_3" })).rejects.toThrow();
  });
});
