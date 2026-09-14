import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(resolve(__dirname, relative), "utf8");
const readBin = (relative: string) => readFileSync(resolve(__dirname, relative));

const clientFaviconPath = "../../public/favicon.ico";
const adminFaviconPath = "../../../admin/public/favicon.ico";
const adminNuxtConfig = read("../../../admin/nuxt.config.ts");
const clientNuxtConfig = read("../../nuxt.config.ts");

/**
 * favicon 品牌化 (2026-09-15)。
 *
 * 背景: 用户端的 favicon 一直是最初那 28×28 的粉紫像素画(上游遗留), 而页头/页脚/侧栏
 * 早已统一成「蓝渐变方块 + 🐛」; 管理后台则**完全没有** favicon(访问返回 404)。
 * 这里钉住三件事: ① 两个图标都存在且是 32×32; ② 两者**互不相同**(同时开标签页要能分辨);
 * ③ 两个应用都在 head 里声明了 favicon。
 */

/** 从 .ico 头部解析出内嵌图像尺寸 (ICONDIR: reserved(2) type(2) count(2), 之后每 16 字节一项, 宽度/高度在 +0/+1) */
function icoSizes(buf: Buffer): Array<[number, number]> {
  const count = buf.readUInt16LE(4);
  const sizes: Array<[number, number]> = [];

  for (let i = 0; i < count; i++) {
    const offset = 6 + i * 16;
    // 0 表示 256 (ICO 规范里 256 用一个字节存不下, 记 0)
    const w = buf[offset] === 0 ? 256 : buf[offset];
    const h = buf[offset + 1] === 0 ? 256 : buf[offset + 1];

    sizes.push([w, h]);
  }

  return sizes;
}

describe("favicon: 用户端与后台都换成品牌图标", () => {
  it("用户端 favicon 存在, 是 32x32 的 ICO (不再是 28x28 那张旧图)", () => {
    const buf = readBin(clientFaviconPath);

    // ICO 魔数: reserved=0, type=1
    expect(buf.readUInt16LE(0)).toBe(0);
    expect(buf.readUInt16LE(2)).toBe(1);
    expect(icoSizes(buf)).toEqual([[32, 32]]);
    expect(statSync(resolve(__dirname, clientFaviconPath)).size).toBeGreaterThan(200);
  });

  it("后台 favicon 存在且同样是 ICO (改前这里根本没有文件, /favicon.ico 是 404)", () => {
    const buf = readBin(adminFaviconPath);

    expect(buf.readUInt16LE(0)).toBe(0);
    expect(buf.readUInt16LE(2)).toBe(1);
    expect(icoSizes(buf)).toEqual([[32, 32]]);
  });

  it("两个图标必须**不同** —— 同时开用户端与后台时标签栏要能分辨", () => {
    const client = readBin(clientFaviconPath);
    const admin = readBin(adminFaviconPath);

    expect(client.equals(admin)).toBe(false);
  });

  it("两个应用都在 head 里声明了 favicon", () => {
    expect(clientNuxtConfig).toMatch(/rel:\s*"icon"/);
    expect(clientNuxtConfig).toContain("/favicon.ico");
    expect(adminNuxtConfig).toMatch(/rel:\s*"icon"/);
    expect(adminNuxtConfig).toContain("/favicon.ico");
  });
});
