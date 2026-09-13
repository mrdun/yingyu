import { DEFAULT_CORS_ORIGINS, resolveCorsOrigins } from "../cors";

describe("CORS 来源解析 (task 一)", () => {
  it("keeps local defaults when nothing is configured", () => {
    const origins = resolveCorsOrigins(undefined);
    expect(origins).toHaveLength(DEFAULT_CORS_ORIGINS.length);
    expect(origins).toContainEqual(DEFAULT_CORS_ORIGINS[0]);
  });

  it("adds production origins from CORS_ORIGINS (comma separated)", () => {
    const origins = resolveCorsOrigins("https://app.earthworm.com, https://www.earthworm.com");

    expect(origins).toContain("https://app.earthworm.com");
    expect(origins).toContain("https://www.earthworm.com");
    expect(origins).toHaveLength(DEFAULT_CORS_ORIGINS.length + 2);
  });

  it("ignores empty entries and whitespace", () => {
    const origins = resolveCorsOrigins(" , ,https://a.com, ");
    expect(origins).toContain("https://a.com");
    expect(origins).toHaveLength(DEFAULT_CORS_ORIGINS.length + 1);
  });
});
