/**
 * 静态预览服务器 (用于验证 nuxt generate 的产物)。
 *
 * 为什么需要它: 本应用是 ssr:false 的 SPA, nuxt generate 只产出静态文件,
 * 直接刷新 /dashboard 这类前端路由需要服务器回退到 index.html。
 * 这里用 Node 内置 http 实现, 不引入额外依赖。
 *
 * 用法: node scripts/serve.mjs   (PORT 默认 3002)
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";

const PORT = Number(process.env.PORT || 3002);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = resolve(process.cwd(), ".output", "public");
const SPA_FALLBACKS = ["200.html", "index.html"];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

if (!existsSync(PUBLIC_DIR)) {
  console.error(`[serve] 找不到构建产物: ${PUBLIC_DIR}\n请先执行 pnpm -F admin generate`);
  process.exit(1);
}

function readSpaFallback() {
  for (const candidate of SPA_FALLBACKS) {
    const file = join(PUBLIC_DIR, candidate);
    if (existsSync(file)) return { file, body: readFileSync(file) };
  }
  return null;
}

function resolveSafePath(urlPath) {
  const decoded = decodeURIComponent((urlPath || "/").split("?")[0].split("#")[0]);
  const candidate = resolve(PUBLIC_DIR, `.${decoded}`);
  // 防目录穿越: 解析后的路径必须仍在产物目录内
  if (candidate !== PUBLIC_DIR && !candidate.startsWith(PUBLIC_DIR + sep)) return null;
  return candidate;
}

const server = createServer((req, res) => {
  const target = resolveSafePath(req.url ?? "/");
  if (!target) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("bad request");
    return;
  }

  if (existsSync(target) && statSync(target).isFile()) {
    res.writeHead(200, {
      "content-type": MIME_TYPES[extname(target)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(readFileSync(target));
    return;
  }

  // 前端路由 (无扩展名) 回退到 SPA 入口
  if (!extname(target)) {
    const fallback = readSpaFallback();
    if (fallback) {
      res.writeHead(200, { "content-type": MIME_TYPES[".html"], "cache-control": "no-store" });
      res.end(fallback.body);
      return;
    }
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("not found");
});

server.listen(PORT, HOST, () => {
  console.log(`[serve] 静态预览已启动 (端口 ${PORT}), 产物目录: ${PUBLIC_DIR}`);
});
