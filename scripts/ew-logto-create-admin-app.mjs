/**
 * 为管理后台创建**独立** Logto SPA 应用 (幂等, 可重复执行)。
 *
 * 为什么需要独立应用:
 *   admin 与用户端共用同一个 SPA 应用时, 两端 scopes 完全相同 —— 用户端也被迫申请
 *   admin:access ("每个会员登录都申请管理权限")。拆成独立应用后, 用户端才能把它摘掉。
 *
 * 为什么直接写库而不是用 API:
 *   本机 M2M 凭据 (LOGTO_CLIENT_ID/SECRET) **没有 Management API 权限**, 向 Logto 换管理
 *   API token 会得到 400 invalid_target, 因此无法通过 Management API 建应用。
 *   生产环境请优先用 Logto 控制台 (http://localhost:3011/console → Applications) 创建。
 *
 * 用法:
 *   node scripts/ew-logto-create-admin-app.mjs
 * 环境变量:
 *   LOGTO_DB_CONTAINER  (默认 earthworm-logtoPostgres-1)
 *   LOGTO_ENDPOINT      (默认 http://127.0.0.1:3010/)
 *   ADMIN_APP_NAME      (默认 earthworm-admin)
 *   ADMIN_APP_BASE_URL  (默认 http://localhost:3002)
 */
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const CONTAINER = process.env.LOGTO_DB_CONTAINER || "earthworm-logtoPostgres-1";
const ENDPOINT = process.env.LOGTO_ENDPOINT || "http://127.0.0.1:3010/";
const APP_NAME = process.env.ADMIN_APP_NAME || "earthworm-admin";
const BASE_URL = (process.env.ADMIN_APP_BASE_URL || "http://localhost:3002").replace(/\/$/, "");
const TENANT = "default";
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

const psql = (sql) =>
  execSync(`docker exec ${CONTAINER} psql -U postgres -d logto -tAc ${JSON.stringify(sql)}`, {
    encoding: "utf8",
  }).trim();

const randomId = (len) =>
  Array.from(randomBytes(len))
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join("");

let appId = psql(
  `select id from applications where name='${APP_NAME}' and tenant_id='${TENANT}' limit 1;`,
);
if (appId) {
  console.log(`[skip] 应用已存在: ${APP_NAME} (${appId})`);
} else {
  appId = randomId(20);
  const secret = randomId(32);
  const oidc = {
    redirectUris: [
      `${BASE_URL}/callback`,
      `${BASE_URL.replace("localhost", "127.0.0.1")}/callback`,
    ],
    postLogoutRedirectUris: [`${BASE_URL}/`, `${BASE_URL.replace("localhost", "127.0.0.1")}/`],
    backchannelLogoutSessionRequired: false,
  };
  const custom = {
    idTokenTtl: 3600,
    corsAllowedOrigins: [],
    rotateRefreshToken: true,
    refreshTokenTtlInDays: 14,
    alwaysIssueRefreshToken: false,
  };
  psql(
    `insert into applications (id, name, secret, description, type, oidc_client_metadata, custom_client_metadata, is_third_party, created_at, tenant_id) ` +
      `values ('${appId}', '${APP_NAME}', '${secret}', '独立管理后台 (Admin Web)', 'SPA', ` +
      `'${JSON.stringify(oidc)}'::jsonb, '${JSON.stringify(custom)}'::jsonb, false, now(), '${TENANT}');`,
  );
  console.log(`[created] ${APP_NAME} (${appId})`);
  console.log("  ⚠️ secret 未打印 (SPA 不需要 secret); 如需查看请在 Logto 控制台操作。");
}
console.log(
  "  redirectUris:",
  psql(`select oidc_client_metadata from applications where id='${appId}';`),
);

// 对照探针: 已注册回调应被受理(303), 未注册回调必须被拒(400 invalid_redirect_uri)
const probe = async (clientId, redirectUri) => {
  const url = new URL("oidc/auth", ENDPOINT);
  for (const [k, v] of Object.entries({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid offline_access profile email admin:access",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
    state: "probe",
    resource: process.env.BACKEND_ENDPOINT || "http://localhost:3001/",
  })) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url, { redirect: "manual" });
  const body = await res.text();
  return { status: res.status, error: (body.match(/"error":"([^"]+)/) || [])[1] || "" };
};

const ok = await probe(appId, `${BASE_URL}/callback`);
const bad = await probe(appId, "http://localhost:3999/callback");
console.log(`  [probe] 已注册回调: HTTP ${ok.status} (期望 303)`);
console.log(
  `  [probe] 未注册回调: HTTP ${bad.status} ${bad.error} (期望 400 invalid_redirect_uri)`,
);
console.log(
  ok.status === 303 && bad.status === 400
    ? "\n✅ 验证通过: 该应用可用, 且回调按应用各自校验。"
    : "\n❌ 验证未通过: 请检查上面的响应。",
);
console.log(`\n把 admin 的 LOGTO_APP_ID 设为: ${appId}`);
