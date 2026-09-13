/**
 * RC 静态预览服务器 (无第三方依赖)。
 *
 * 用途: 本地 RC 验证时按「生产静态托管」的方式提供前端产物
 * (apps/client/.output/public), 含 SPA 回退 (等价于 Nginx 的 try_files ... /200.html)。
 *
 * 用法:
 *   pnpm build:client                 # 先生成 apps/client/.output/public
 *   node scripts/rc-static-server.mjs # 默认 http://localhost:3000
 *
 * 端口默认 3000: 本地 Logto 应用的 Redirect URI 只注册了
 * http://localhost:3000/callback 与 http://127.0.0.1:3000/callback,
 * 换端口会导致登录回调失败 (除非同时在 Logto 控制台登记)。
 *
 * 注意: 仅用于本地 RC 验证, 不是生产服务器。
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "apps/client/.output/public");
const port = Number(process.env.RC_STATIC_PORT ?? 3000);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
};

if (!existsSync(root)) {
  console.error(`未找到前端产物: ${root} — 请先执行 pnpm build:client`);
  process.exit(1);
}

createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let filePath = normalize(join(root, urlPath));

  // 目录/缺失文件回退到 200.html (SPA)
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(root, "200.html");
  }

  res.writeHead(200, {
    "Content-Type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  createReadStream(filePath).pipe(res);
}).listen(port, () => {
  console.log(`RC 静态预览: http://127.0.0.1:${port} (root=${root})`);
});
