/**
 * 生产 Smoke Test (发布后立即执行)。
 *
 * 用法:
 *   pnpm smoke:prod                                   # 用 PROD_API_BASE 环境变量
 *   pnpm smoke:prod -- --base=https://api.example.com
 *   pnpm smoke:prod -- --base=https://api.example.com --token=<用户JWT> [--admin-token=<管理员JWT>]
 *
 * 检查内容:
 *   1) Backend 依赖:  /health → database / redis / logto
 *   2) 业务只读接口: /plans, /membership/payment-methods, /membership/status(需 token),
 *                    /partner/me(需 token), /admin/payment-channels(需 admin token)
 *
 * 只做只读检查, 不创建订单、不触发支付、不修改任何数据。
 */
const DEFAULT_TIMEOUT_MS = 10_000;

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  skipped?: boolean;
}

function parseArgs(argv: string[]) {
  const read = (flag: string) => {
    const inline = argv.find((arg) => arg.startsWith(`${flag}=`));
    if (inline) return inline.slice(flag.length + 1);
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    base: (read("--base") ?? process.env.PROD_API_BASE ?? "").replace(/\/$/, ""),
    token: read("--token") ?? process.env.PROD_SMOKE_TOKEN,
    adminToken: read("--admin-token") ?? process.env.PROD_SMOKE_ADMIN_TOKEN,
    json: argv.includes("--json"),
  };
}

async function request(
  url: string,
  token?: string,
): Promise<{ status: number; body: any; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
    const text = await response.text();
    let body: any = undefined;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    return { status: response.status, body, text };
  } finally {
    clearTimeout(timer);
  }
}

async function check(
  name: string,
  run: () => Promise<{ ok: boolean; detail: string }>,
): Promise<CheckResult> {
  try {
    const result = await run();
    return { name, ...result };
  } catch (error) {
    return { name, ok: false, detail: (error as Error).message };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.base) {
    console.error("缺少 API 地址: 使用 --base=https://api.example.com 或 PROD_API_BASE");
    process.exitCode = 2;
    return;
  }
  if (!args.base.startsWith("https://")) {
    console.warn(`⚠️  API 地址不是 https: ${args.base}`);
  }

  const results: CheckResult[] = [];

  // 1) 依赖健康检查
  let healthBody: any = undefined;
  results.push(
    await check("health endpoint", async () => {
      const res = await request(`${args.base}/health`);
      healthBody = res.body;
      if (res.status !== 200) {
        return { ok: false, detail: `HTTP ${res.status} (database 不可用?)` };
      }
      return { ok: true, detail: `status=${res.body?.status}` };
    }),
  );

  results.push(
    await check("database connection", async () => ({
      ok: healthBody?.checks?.database === "ok",
      detail: `database=${healthBody?.checks?.database ?? "unknown"}`,
    })),
  );

  results.push(
    await check("redis connection", async () => {
      const state = healthBody?.checks?.redis ?? "unknown";
      return { ok: state === "ok", detail: `redis=${state}`, skipped: state === "skipped" };
    }),
  );

  results.push(
    await check("logto connection", async () => {
      const state = healthBody?.checks?.logto ?? "unknown";
      return { ok: state === "ok", detail: `logto=${state}`, skipped: state === "skipped" };
    }),
  );

  // 2) 业务只读接口
  results.push(
    await check("plans api", async () => {
      const res = await request(`${args.base}/plans`);
      const plans = Array.isArray(res.body) ? res.body : [];
      return {
        ok: res.status === 200 && plans.length > 0,
        detail: `HTTP ${res.status}, plans=${plans.length}${plans.length === 0 ? " (空库? 商城无商品)" : ""}`,
      };
    }),
  );

  results.push(
    await check("payment methods api", async () => {
      const res = await request(`${args.base}/membership/payment-methods`);
      const methods = Array.isArray(res.body) ? res.body : [];
      // 渠道全部关闭时返回空数组是合法状态 (先上课程、后开支付), 不能算失败;
      // 但只要渠道已开启就必须有可用支付方式, 因此空数组要在报告里显式提示。
      const empty = methods.length === 0;
      return {
        ok: res.status === 200,
        detail: `HTTP ${res.status}, methods=[${methods.map((m: any) => m.method).join(", ")}]${
          empty ? "  ⚠️ 当前无可用支付方式 (渠道未开启; 正式收款前需在后台开启并配置密钥)" : ""
        }`,
      };
    }),
  );

  results.push(
    await check("membership status api", async () => {
      if (!args.token) return { ok: true, detail: "未提供 --token, 跳过", skipped: true };
      const res = await request(`${args.base}/membership/status`, args.token);
      return {
        ok: res.status === 200 && typeof res.body?.isMember === "boolean",
        detail: `HTTP ${res.status}, isMember=${res.body?.isMember}`,
      };
    }),
  );

  results.push(
    await check("partner api", async () => {
      if (!args.token) return { ok: true, detail: "未提供 --token, 跳过", skipped: true };
      const res = await request(`${args.base}/partner/me`, args.token);
      // 未登录 / 无推广资格都算接口可用; 关键是不能 5xx
      return {
        ok: res.status < 500,
        detail: `HTTP ${res.status}`,
      };
    }),
  );

  results.push(
    await check("payment channel admin api", async () => {
      if (!args.adminToken) {
        return { ok: true, detail: "未提供 --admin-token, 跳过", skipped: true };
      }
      const res = await request(`${args.base}/admin/payment-channels`, args.adminToken);
      const channels = Array.isArray(res.body) ? res.body : [];
      return {
        ok: res.status === 200,
        detail: `HTTP ${res.status}, channels=[${channels
          .map(
            (c: any) =>
              `${c.provider}:${c.enabled ? "enabled" : "disabled"}${c.configured ? "" : "/NO_CRED"}`,
          )
          .join(", ")}]`,
      };
    }),
  );

  const failed = results.filter((item) => !item.ok);

  if (args.json) {
    console.log(JSON.stringify({ base: args.base, results, passed: failed.length === 0 }, null, 2));
  } else {
    console.log(`生产 Smoke Test: ${args.base}\n`);
    for (const item of results) {
      const mark = item.skipped ? "⏭️" : item.ok ? "✅" : "❌";
      console.log(`${mark} ${item.name} — ${item.detail}`);
    }
    console.log(failed.length === 0 ? "\n结论: 通过 ✅" : `\n结论: ${failed.length} 项失败 ❌`);
  }

  // 不用 process.exit(): 在 Windows 上 undici 的 keep-alive 句柄会导致 libuv 断言崩溃
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main();
