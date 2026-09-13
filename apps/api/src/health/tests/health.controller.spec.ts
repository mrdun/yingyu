import { getRedisConnectionToken } from "@nestjs-modules/ioredis";
import { Test, TestingModule } from "@nestjs/testing";

import { DB } from "../../global/providers/db.provider";
import { LogtoService } from "../../logto/logto.service";
import { HealthController, withTimeout } from "../health.controller";

function mockResponse() {
  const res: any = { status: jest.fn(() => res) };
  return res;
}

describe("HealthController (task 三)", () => {
  let db: { execute: jest.Mock };
  let controller: HealthController;

  beforeEach(async () => {
    db = { execute: jest.fn().mockResolvedValue([{ "?column?": 1 }]) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthController, { provide: DB, useValue: db }],
    }).compile();
    controller = module.get(HealthController);
  });

  async function buildWithDependencies(redis: unknown, logto: unknown) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthController,
        { provide: DB, useValue: db },
        { provide: getRedisConnectionToken(), useValue: redis },
        { provide: LogtoService, useValue: logto },
      ],
    }).compile();
    return module.get(HealthController);
  }

  it("reports ok when database/redis/logto are healthy", async () => {
    const healthController = await buildWithDependencies(
      { ping: async () => "PONG" },
      { fetchToken: async () => "token" },
    );
    const res = mockResponse();

    const report = await healthController.check(res);

    expect(report.status).toBe("ok");
    expect(report.checks).toEqual({ database: "ok", redis: "ok", logto: "ok" });
    expect(res.status).not.toHaveBeenCalledWith(503);
  });

  it("returns 503 when the database is unavailable", async () => {
    db.execute.mockRejectedValue(new Error("connection refused"));
    const res = mockResponse();

    const report = await controller.check(res);

    expect(report.status).toBe("fail");
    expect(report.checks.database).toBe("fail");
    expect(report.details?.database).toContain("connection refused");
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it("degrades (but stays 200) when optional dependencies fail", async () => {
    const healthController = await buildWithDependencies(
      {
        ping: () => {
          throw new Error("redis down");
        },
      },
      { fetchToken: async () => "token" },
    );
    const res = mockResponse();

    const report = await healthController.check(res);

    expect(report.status).toBe("degraded");
    expect(report.checks.redis).toBe("fail");
    expect(res.status).not.toHaveBeenCalledWith(503);
  });

  it("skips optional dependencies that are not wired", async () => {
    const report = await controller.check(mockResponse());

    expect(report.checks.redis).toBe("skipped");
    expect(report.checks.logto).toBe("skipped");
    expect(report.status).toBe("ok");
  });

  it("times out slow dependencies instead of hanging", async () => {
    await expect(withTimeout(new Promise(() => undefined), "redis", 20)).rejects.toThrow(
      /redis timeout/,
    );
  });
});
