import type { Config } from "jest";

import baseConfig from "./jest.config";

const config: Config = {
  ...baseConfig,
  testRegex: ".*\\.e2e-spec\\.ts$",
  // e2e 串行执行: 所有 e2e suite 共用同一个 Postgres, 且每个 suite 的 beforeEach 都会
  // cleanDB (TRUNCATE 全表 + RESTART IDENTITY CASCADE)。并行 worker 下 A suite 的
  // TRUNCATE 会清掉 B suite 正在断言的种子数据, 造成偶发失败。
  // 确定性优先, 故固定 maxWorkers: 1 (unit 测试并行度不受影响, 见 jest.config.ts)。
  maxWorkers: 1,
};

export default config;
