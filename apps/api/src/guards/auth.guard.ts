import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

export const UncheckAuth = () => SetMetadata("uncheck", true);
export const Permissions = (...permissions: string[]) => SetMetadata("permissions", permissions);

@Injectable()
export class AuthGuard implements CanActivate {
  private jwks: any;
  constructor() {
    this.jwks = createRemoteJWKSet(
      new URL("/oidc/jwks", process.env.LOGTO_ENDPOINT || "http://localhost:3010/"),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    // 路由级元数据优先, 其次回退到控制器级 (控制器级让新增路由默认继承权限, 避免漏标即放开)
    // getClass 在部分单测的 mock context 中不存在, 这里做防御性取值
    const controllerClass = typeof context.getClass === "function" ? context.getClass() : undefined;
    const uncheck =
      Reflect.getMetadata("uncheck", context.getHandler()) ??
      (controllerClass ? Reflect.getMetadata("uncheck", controllerClass) : undefined);
    const permissions =
      Reflect.getMetadata("permissions", context.getHandler()) ??
      (controllerClass ? Reflect.getMetadata("permissions", controllerClass) : undefined);

    if (!token && uncheck) {
      request["userId"] = null;
    } else if (!token) {
      throw new UnauthorizedException();
    }
    try {
      const payload = await this.jwtVerify(token);

      const scopes = typeof payload.scope === "string" ? payload.scope.split(" ") : [];

      if (permissions) {
        if (!permissions.every((scope) => scopes.includes(scope))) {
          // 已登录但权限不足: 403 (401 会让前端误判为「未登录」)
          throw new ForbiddenException("Insufficient permissions");
        }
      }

      request["userId"] = payload.sub;
    } catch (e) {
      if (e instanceof ForbiddenException) {
        throw e;
      }
      if (!uncheck) {
        throw new UnauthorizedException();
      }
    }
    return true;
  }

  private async jwtVerify(token) {
    const { payload } = await jwtVerify(
      // The raw Bearer Token extracted from the request header
      token,
      this.jwks,
      {
        // Expected issuer of the token, issued by the Logto server
        issuer: new URL("oidc", process.env.LOGTO_ENDPOINT || "http://localhost:3010/").href,
        // Expected audience token, the resource indicator of the current API
        audience: process.env.BACKEND_ENDPOINT,
      },
    );

    return payload;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}
