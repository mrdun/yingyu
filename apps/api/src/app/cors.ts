/**
 * CORS 允许来源。
 *
 * 默认只放开本地开发与历史域名; 生产必须通过 CORS_ORIGINS 显式声明真实站点域名
 * (逗号分隔, 可带 https://)。未配置时前端跨域调用会被浏览器拦截。
 */
export const DEFAULT_CORS_ORIGINS: RegExp[] = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^http:\/\/earthworm\.cuixueshe\.com(:81)?$/,
];

export function resolveCorsOrigins(env: string | undefined = process.env.CORS_ORIGINS) {
  const configured = (env ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return [...DEFAULT_CORS_ORIGINS, ...configured];
}
