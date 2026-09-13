/**
 * 生产配置检查 (上线前最后一道门禁)。
 *
 * 用法:
 *   pnpm config:check:prod                        # 只检查环境变量
 *   pnpm config:check:prod -- --channels wechat   # 额外声明已开启的支付渠道
 *   pnpm config:check:prod -- --json              # 机器可读输出 (CI 用)
 *
 * 行为:
 *   - 缺失必需变量 / 支付渠道缺少密钥 → 打印缺失清单并以退出码 1 结束
 *   - 全部通过 → 退出码 0
 *
 * 说明: 数据库中的支付渠道开关由服务启动时再做一次强校验
 * (PaymentChannelService.onModuleInit): 生产环境"渠道已开启但缺密钥"会直接拒绝启动。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findMissingPaymentEnv,
  findMissingProductionEnv,
} from "../apps/api/src/app/startup-config";

/** 简单 .env 解析 (不覆盖已存在的真实环境变量) */
function loadEnvFile(path: string): void {
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    const value = line
      .slice(index + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function parseArgs(argv: string[]) {
  const channelsArg = argv.find((arg) => arg.startsWith("--channels="));
  const positional = argv.indexOf("--channels");
  const channels =
    channelsArg?.slice("--channels=".length) ??
    (positional >= 0 ? argv[positional + 1] : undefined) ??
    process.env.PAYMENT_ENABLED_CHANNELS ??
    "";
  return {
    json: argv.includes("--json"),
    envFile: (argv.find((arg) => arg.startsWith("--env-file=")) ?? "").slice("--env-file=".length),
    channels: channels
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

/** 本地/占位值检查: 生产配置里出现这些值视为未配置 */
function findSuspiciousValues(env: NodeJS.ProcessEnv): string[] {
  const suspicious: string[] = [];
  const localHosts = /(localhost|127\.0\.0\.1|0\.0\.0\.0)/i;

  for (const key of [
    "DATABASE_URL",
    "REDIS_URL",
    "LOGTO_ENDPOINT",
    "BACKEND_ENDPOINT",
    "PUBLIC_API_BASE_URL",
  ]) {
    const value = env[key];
    if (value && localHosts.test(value)) {
      suspicious.push(`${key} 指向本地地址 (${value})`);
    }
  }
  const apiBase = env.PUBLIC_API_BASE_URL;
  if (apiBase && !apiBase.startsWith("https://")) {
    suspicious.push(`PUBLIC_API_BASE_URL 必须为 https (当前: ${apiBase})`);
  }
  const cors = env.CORS_ORIGINS;
  if (cors && localHosts.test(cors)) {
    suspicious.push(`CORS_ORIGINS 包含本地地址 (${cors})`);
  }
  if (env.NODE_ENV !== "prod" && env.NODE_ENV !== "production") {
    suspicious.push(
      `NODE_ENV 不是生产值 (当前: ${env.NODE_ENV ?? "未设置"}), mock 支付与调试入口不会关闭`,
    );
  }
  return suspicious;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const envFile = args.envFile || resolve(process.cwd(), "apps/api/.env.prod");
  loadEnvFile(envFile);

  const missingEnv = findMissingProductionEnv(process.env);
  const missingPayment = findMissingPaymentEnv(process.env, {
    enabledChannels: args.channels,
  });
  const suspicious = findSuspiciousValues(process.env);

  const report = {
    envFile,
    nodeEnv: process.env.NODE_ENV ?? null,
    requiredEnvCount: missingEnv.length === 0 ? "ok" : `${missingEnv.length} missing`,
    missingEnv,
    declaredChannels: args.channels,
    missingPayment,
    suspicious,
    passed: missingEnv.length === 0 && missingPayment.length === 0 && suspicious.length === 0,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`生产配置检查 (env 文件: ${envFile})`);
    console.log(`NODE_ENV: ${report.nodeEnv ?? "未设置"}`);
    console.log(
      missingEnv.length === 0
        ? "✅ 必需环境变量齐全"
        : `❌ 缺少必需环境变量:\n  - ${missingEnv.join("\n  - ")}`,
    );
    if (args.channels.length > 0) {
      console.log(
        missingPayment.length === 0
          ? `✅ 支付渠道凭据齐全 (${args.channels.join(", ")})`
          : `❌ 支付渠道缺少凭据:\n  - ${missingPayment.join("\n  - ")}`,
      );
    } else {
      console.log("ℹ️  未声明支付渠道 (--channels wechat,alipay): 仅跳过支付凭据检查");
    }
    if (suspicious.length > 0) {
      console.log(`⚠️  可疑/危险配置:\n  - ${suspicious.join("\n  - ")}`);
    }
    console.log(report.passed ? "\n结论: 通过 ✅" : "\n结论: 未通过 ❌ (禁止上线)");
  }

  // 设置 exitCode 而不调用 process.exit(), 避免 Windows 上 libuv 句柄断言崩溃
  process.exitCode = report.passed ? 0 : 1;
}

main();
