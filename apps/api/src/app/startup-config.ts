/**
 * 生产启动配置校验 (fail-fast)。
 *
 * 目的: 缺配置时**启动即失败**, 避免出现「能启动但认证失效 / 回调收不到 / 前端跨域被拦截」
 * 这类上线当天才暴露的问题。仅在生产环境强制, 本地开发与测试不受影响。
 */
export const REQUIRED_PRODUCTION_ENV = [
  "DATABASE_URL",
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

/** 生产环境缺少必需配置时抛错 (返回缺失项列表, 便于日志/测试) */
export function assertProductionConfig(
  isProd: boolean,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const missing = findMissingProductionEnv(env);
  if (isProd && missing.length > 0) {
    throw new Error(
      `生产环境缺少必需环境变量: ${missing.join(", ")} (参见 PRODUCTION_RELEASE_CHECKLIST.md)`,
    );
  }
  return missing;
}
