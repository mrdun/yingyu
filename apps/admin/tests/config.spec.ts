import { describe, expect, it } from "vitest";

import { fileExists, listSourceFiles, readSource } from "./helpers/admin-source";

/**
 * 配置与安全。
 * 这些断言防的回归:
 *  - 缺 .env.example, 后续开发者只能去猜变量名
 *  - 把后端地址硬编码进源码 (换环境必须改代码, 且会把 localhost 打进生产产物)
 *  - 把真实密钥写进 .env.example 并提交
 *  - 构建期门禁失效, 静默产出 runtimeConfig 全空的坏产物
 */

const envExample = () => readSource(".env.example");

describe(".env.example", () => {
  it("存在", () => {
    expect(fileExists(".env.example")).toBe(true);
  });

  it("包含本批次全部必需配置项", () => {
    const content = envExample();
    for (const key of [
      "ADMIN_API_BASE_URL",
      "LOGTO_ENDPOINT",
      "LOGTO_APP_ID",
      "BACKEND_ENDPOINT",
      "LOGTO_SIGN_IN_REDIRECT_URI",
      "LOGTO_SIGN_OUT_REDIRECT_URI",
    ]) {
      expect(content).toContain(key);
    }
  });

  it("端口 3002 (与用户端 3000 区分)", () => {
    const content = envExample();
    expect(content).toContain("http://localhost:3002/callback");
    expect(content).toContain("http://localhost:3002/");
  });

  it("不含任何真实密钥 / 机密 (只放公开的客户端配置)", () => {
    const content = envExample();
    expect(content).not.toMatch(/SECRET/i);
    expect(content).not.toMatch(/PASSWORD/i);
    expect(content).not.toMatch(/API_?KEY/i);
    expect(content).not.toMatch(/PRIVATE_?KEY/i);
    expect(content).not.toMatch(/MCH_?ID/i);
    expect(content).not.toMatch(/ACCESS_?TOKEN/i);
    expect(content).not.toMatch(/DATABASE_URL/i);
  });

  it("仓库根 .gitignore 忽略 .env (示例文件可以提交, 真实 .env 不能)", () => {
    const rootIgnore = readSource("../../.gitignore");
    expect(rootIgnore.split(/\r?\n/)).toContain(".env");
  });
});

describe("运行期配置", () => {
  const nuxtConfig = readSource("nuxt.config.ts");

  it("ssr: false (与用户端部署模式一致, 可静态产出)", () => {
    expect(nuxtConfig).toContain("ssr: false");
  });

  it("所有地址都走 runtimeConfig, 不在源码里硬编码后端地址", () => {
    for (const key of [
      "adminApiBaseUrl",
      "endpoint",
      "appId",
      "backendEndpoint",
      "signInRedirectURI",
      "signOutRedirectURI",
    ]) {
      expect(nuxtConfig).toContain(key);
    }
    expect(nuxtConfig).toContain("process.env.ADMIN_API_BASE_URL");
    expect(nuxtConfig).not.toContain("http://localhost");
  });

  it("构建期门禁: 缺变量直接失败, 不静默产出坏产物", () => {
    expect(nuxtConfig).toContain("REQUIRED_BUILD_ENV");
    expect(nuxtConfig).toContain("throw new Error");
  });
});

describe("源码不得硬编码 localhost", () => {
  it("没有任何源码文件写死 localhost:3001 (含 API 地址)", () => {
    const offenders = listSourceFiles().filter((file) =>
      readSource(file).includes("localhost:3001"),
    );
    expect(offenders).toEqual([]);
  });

  it("页面里没有任何绝对 http(s) URL", () => {
    const pages = listSourceFiles().filter((file) => file.startsWith("pages/"));
    const offenders = pages.filter((file) => /https?:\/\//.test(readSource(file)));
    expect(offenders).toEqual([]);
  });
});
