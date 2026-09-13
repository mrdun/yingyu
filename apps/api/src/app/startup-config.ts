/**
 * 生产启动配置校验 (fail-fast)。
 *
 * 目的: 缺配置时**启动即失败**, 避免出现「能启动但认证失效 / 回调收不到 / 前端跨域被拦截」
 * 这类上线当天才暴露的问题。仅在生产环境强制, 本地开发与测试不受影响。
 */
export const REQUIRED_PRODUCTION_ENV = [
  "DATABASE_URL",
  "REDIS_URL",
  "LOGTO_ENDPOINT",
  "LOGTO_CLIENT_ID",
  "LOGTO_CLIENT_SECRET",
  "BACKEND_ENDPOINT",
  "PUBLIC_API_BASE_URL",
  "CORS_ORIGINS",
] as const;

export function findMissingProductionEnv(
  env: NodeJS.ProcessEnv = process.env,
  required: readonly string[] = REQUIRED_PRODUCTION_ENV,
): string[] {
  return required.filter((key) => {
    const value = env[key];
    return value === undefined || value.trim() === "";
  });
}

/** 每个支付渠道必需的凭据 (与 payment provider 的 configured 判断保持一致) */
export const PAYMENT_PROVIDER_ENV: Record<string, string[]> = {
  wechat: [
    "WECHAT_APP_ID",
    "WECHAT_MCH_ID",
    "WECHAT_API_KEY",
    // 退款走 mTLS, 缺证书时退款会明确失败
    "WECHAT_CERT_PATH",
    "WECHAT_CERT_KEY_PATH",
  ],
  alipay: ["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY"],
};

/**
 * 支付凭据检查 (只检查"已启用"的渠道)。
 * - enabledChannels: 数据库中已开启的渠道 (business_settings), 开启即必须配齐
 * - provider: 显式传入的默认渠道 (非 mock 时同样要求配齐)
 *
 * 注意: 未启用任何渠道时不报错 (允许先上课程、后开支付), 由调用方决定是否告警。
 */
export function findMissingPaymentEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: { provider?: string; enabledChannels?: string[] } = {},
): string[] {
  const provider = options.provider ?? env.PAYMENT_PROVIDER ?? "mock";
  const channels = new Set<string>(options.enabledChannels ?? []);
  if (provider !== "mock") channels.add(provider);

  const missing: string[] = [];
  for (const channel of channels) {
    const required = PAYMENT_PROVIDER_ENV[channel];
    if (!required) {
      missing.push(`PAYMENT_PROVIDER (未知渠道: ${channel})`);
      continue;
    }
    missing.push(...findMissingProductionEnv(env, required));
  }
  return missing;
}

/** 生产环境缺少必需配置时抛错 (返回缺失项列表, 便于日志/测试) */
export function assertProductionConfig(
  isProd: boolean,
  env: NodeJS.ProcessEnv = process.env,
  paymentOptions: { provider?: string; enabledChannels?: string[] } = {},
): string[] {
  const missing = [...findMissingProductionEnv(env), ...findMissingPaymentEnv(env, paymentOptions)];
  if (isProd && missing.length > 0) {
    throw new Error(
      `生产环境缺少必需环境变量: ${missing.join(", ")} (参见 PRODUCTION_RELEASE_CHECKLIST.md)`,
    );
  }
  return missing;
}
