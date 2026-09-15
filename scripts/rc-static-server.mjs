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
// 发音音频目录（由 scripts/tts/generate-audio.py 生成）。
// 单独放在 var/ 下而不是 .output/public 里：后者每次构建都会被清空。
const audioRoot = join(process.cwd(), "var/audio");
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

  // 发音音频：/audio/<hash>.mp3 → var/audio/<hash>.mp3
  // 缺失时**必须回真实 404**（不能走 SPA 回退）：播放端靠 error 事件回退到有道，
  // 若这里返回 200 + HTML，音频元素仍会失败但语义混乱、且不利于排查。
  if (urlPath.startsWith("/audio/")) {
    const rel = normalize(urlPath.slice("/audio/".length)).replace(/^([/\\])+/, "");
    const audioPath = join(audioRoot, rel);
    if (
      !audioPath.startsWith(audioRoot) ||
      !existsSync(audioPath) ||
      statSync(audioPath).isDirectory()
    ) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("audio not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extname(audioPath)] ?? "application/octet-stream",
      // 音频按内容哈希寻址，内容不变 → 可长缓存（改语速会换文件名吗？不会，
      // 但重新生成后文件名相同，所以这里保守用 no-cache 便于本地验证）。
      "Cache-Control": "no-cache",
    });
    createReadStream(audioPath).pipe(res);
    return;
  }

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
  console.log(`发音音频: /audio/* → ${audioRoot}`);
});
