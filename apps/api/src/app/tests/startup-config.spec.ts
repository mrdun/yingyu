import {
  assertProductionConfig,
  findMissingProductionEnv,
  REQUIRED_PRODUCTION_ENV,
} from "../startup-config";

const COMPLETE_ENV = {
  DATABASE_URL: "postgres://user:pass@db:5432/earthworm",
  LOGTO_ENDPOINT: "https://logto.example.com/",
  LOGTO_CLIENT_ID: "client",
  LOGTO_CLIENT_SECRET: "secret",
  BACKEND_ENDPOINT: "https://api.example.com",
  PUBLIC_API_BASE_URL: "https://api.example.com",
  CORS_ORIGINS: "https://www.example.com",
} as NodeJS.ProcessEnv;

describe("生产启动配置校验 (task 一)", () => {
  it("lists every missing required variable", () => {
    const missing = findMissingProductionEnv({ DATABASE_URL: "postgres://x" } as NodeJS.ProcessEnv);

    expect(missing).toContain("LOGTO_ENDPOINT");
    expect(missing).toContain("BACKEND_ENDPOINT");
    expect(missing).toContain("CORS_ORIGINS");
    expect(missing).not.toContain("DATABASE_URL");
  });

  it("treats whitespace-only values as missing", () => {
    const missing = findMissingProductionEnv({
      ...COMPLETE_ENV,
      BACKEND_ENDPOINT: "   ",
    } as NodeJS.ProcessEnv);
    expect(missing).toEqual(["BACKEND_ENDPOINT"]);
  });

  it("fails fast only in production", () => {
    expect(() => assertProductionConfig(false, {} as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => assertProductionConfig(true, COMPLETE_ENV)).not.toThrow();
    expect(() => assertProductionConfig(true, {} as NodeJS.ProcessEnv)).toThrow(/缺少必需环境变量/);
  });

  it("requires audience + CORS in production (security-critical)", () => {
    expect(REQUIRED_PRODUCTION_ENV).toContain("BACKEND_ENDPOINT");
    expect(REQUIRED_PRODUCTION_ENV).toContain("CORS_ORIGINS");
    expect(REQUIRED_PRODUCTION_ENV).toContain("PUBLIC_API_BASE_URL");
  });
});
