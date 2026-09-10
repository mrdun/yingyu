import { afterAll, beforeAll } from "vitest";

import { setupDB, teardownDb } from "./src/db";

beforeAll(async () => {
  // 创建连接数据库
  await setupDB(process.env.DATABASE_URL || "");
});

afterAll(async () => {
  await teardownDb();
});
