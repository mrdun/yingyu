/**
 * 生产环境判断。
 * 注意: 项目 `start:prod` 使用 NODE_ENV=prod (见 package.json / global.module.ts),
 * 这里同时兼容标准的 "production"。
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "prod" || process.env.NODE_ENV === "production";
}
