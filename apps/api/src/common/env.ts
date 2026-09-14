/**
 * 生产环境判断。
 * 注意: 项目 `start:prod` 使用 NODE_ENV=prod (见 package.json / global.module.ts),
 * 这里同时兼容标准的 "production"。
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "prod" || process.env.NODE_ENV === "production";
}

/**
 * AI 内容接口 (`/ai-content/*`) 的非生产调试开关。
 *
 * 只有**非生产**环境**且**显式把 `AI_CONTENT_DEV_BYPASS` 设为真值 (`"true"` / `"1"`, 大小写不敏感)
 * 时才返回 true; 其它所有情况 (包括非生产但没设该变量 —— 默认) 都返回 false。
 *
 * 生产环境永远返回 false: 该开关是本地调试用的, 生产即使误设了也不能削弱鉴权。
 */
export function isAiContentDevBypassEnabled(): boolean {
  if (isProduction()) return false;
  const value = process.env.AI_CONTENT_DEV_BYPASS?.trim().toLowerCase();
  return value === "true" || value === "1";
}
