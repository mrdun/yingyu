/**
 * RC 演示环境辅助脚本: 查看测试账号 / 给账号授予会员 (TASK-002-M-01)。
 *
 * 只做两件事, 不复制任何业务逻辑:
 *   1) `--list-users`  通过 Logto Management API 列出本地 Logto 用户 (便于挑选测试账号)
 *   2) 调用后端既有接口 `POST /admin/memberships/grant` (管理员权限) 授予会员
 *
 * 用法:
 *   node scripts/rc-grant-membership.mjs --list-users
 *   node scripts/rc-grant-membership.mjs --userId=<logtoUserId> --planId=lifetime --token=<管理员JWT>
 *   # token 也可用环境变量 RC_ADMIN_TOKEN 传入
 *
 * 获取管理员 token (浏览器):
 *   1) 用管理员账号登录前端 http://localhost:3000 (本地 Logto 中 admin / mrdun 已带 default:admin)
 *   2) F12 → Network → 任意一个带 Authorization 的请求 (例如 /membership/status)
 *   3) 复制 Request Headers 里的 `Bearer xxx` 中 xxx 部分
 */
import { readFileSync } from "node:fs";

const API_BASE = process.env.RC_API_BASE ?? "http://localhost:3001";
const ENV_FILE = "apps/api/.env.rc";

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=");
    args[key] = value ?? true;
  }
  return args;
}

function readRcEnv() {
  const env = {};
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    env[trimmed.slice(0, index).trim()] = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^"|"$/g, "");
  }
  return env;
}

async function listLogtoUsers() {
  const env = readRcEnv();
  const basic = Buffer.from(`${env.LOGTO_CLIENT_ID}:${env.LOGTO_CLIENT_SECRET}`).toString("base64");
  const tokenRes = await fetch(new URL("oidc/token", env.LOGTO_ENDPOINT), {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      resource: env.LOGTO_M2M_API,
      scope: "all",
    }),
  });
  const { access_token: token } = await tokenRes.json();
  if (!token) throw new Error(`Logto M2M token 获取失败 (HTTP ${tokenRes.status})`);

  const usersRes = await fetch(new URL("api/users", env.LOGTO_ENDPOINT), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const users = await usersRes.json();
  console.log(`本地 Logto 用户 (${Array.isArray(users) ? users.length : 0} 个):`);
  for (const user of users ?? []) {
    console.log(`  id=${user.id}  username=${user.username ?? "-"}  name=${user.name ?? "-"}`);
  }
  console.log(
    "\n提示: 前端注册新账号后再执行本命令, 新账号会出现在列表里 (rc-admin / admin 已带 default:admin)。",
  );
}

async function grantMembership({ userId, planId, token }) {
  if (!userId || !planId) throw new Error("需要 --userId=<logtoUserId> 与 --planId=<planId>");
  if (!token) {
    throw new Error("需要 --token=<管理员JWT> (获取方式见脚本头部注释)");
  }

  const res = await fetch(`${API_BASE}/admin/memberships/grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ userId, planId }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`授予会员失败: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  console.log(`✅ 已授予会员: userId=${userId} planId=${planId}`);
  console.log(text);
}

const args = parseArgs(process.argv.slice(2));

try {
  if (args["list-users"]) {
    await listLogtoUsers();
  } else {
    await grantMembership({
      userId: args.userId,
      planId: args.planId,
      token: args.token ?? process.env.RC_ADMIN_TOKEN,
    });
  }
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exitCode = 1;
}
