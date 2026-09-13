import {
  assertProductionConfig,
  findMissingPaymentEnv,
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
  REDIS_URL: "redis://redis:6379",
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
    expect(REQUIRED_PRODUCTION_ENV).toContain("REDIS_URL");
  });
});

describe("支付凭据检查 (task 五)", () => {
  it("requires wechat credentials when the wechat channel is enabled", () => {
    const missing = findMissingPaymentEnv({} as NodeJS.ProcessEnv, {
      enabledChannels: ["wechat"],
    });

    expect(missing).toContain("WECHAT_APP_ID");
    expect(missing).toContain("WECHAT_MCH_ID");
    expect(missing).toContain("WECHAT_API_KEY");
    // 退款需要 mTLS 证书
    expect(missing).toContain("WECHAT_CERT_PATH");
    expect(missing).toContain("WECHAT_CERT_KEY_PATH");
  });

  it("requires alipay credentials when the alipay channel is enabled", () => {
    const missing = findMissingPaymentEnv({} as NodeJS.ProcessEnv, {
      enabledChannels: ["alipay"],
    });

    expect(missing).toEqual(["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY"]);
  });

  it("passes when every declared channel is fully configured", () => {
    const missing = findMissingPaymentEnv(
      {
        WECHAT_APP_ID: "wx",
        WECHAT_MCH_ID: "190",
        WECHAT_API_KEY: "key",
        WECHAT_CERT_PATH: "/certs/apiclient_cert.pem",
        WECHAT_CERT_KEY_PATH: "/certs/apiclient_key.pem",
        ALIPAY_APP_ID: "2021",
        ALIPAY_PRIVATE_KEY: "private",
        ALIPAY_PUBLIC_KEY: "public",
      } as NodeJS.ProcessEnv,
      { enabledChannels: ["wechat", "alipay"] },
    );

    expect(missing).toEqual([]);
  });

  it("does not fail when no channel is enabled (先上课程后开支付)", () => {
    expect(findMissingPaymentEnv({} as NodeJS.ProcessEnv, {})).toEqual([]);
  });

  it("flags unknown channel names", () => {
    expect(findMissingPaymentEnv({} as NodeJS.ProcessEnv, { provider: "stripe" })).toEqual([
      "PAYMENT_PROVIDER (未知渠道: stripe)",
    ]);
  });

  it("includes payment problems in the production assertion", () => {
    expect(() =>
      assertProductionConfig(true, COMPLETE_ENV, { enabledChannels: ["wechat"] }),
    ).toThrow(/WECHAT_APP_ID/);
    expect(() => assertProductionConfig(false, {} as NodeJS.ProcessEnv)).not.toThrow();
  });
});
