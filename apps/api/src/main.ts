import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { NextFunction, Request, Response } from "express";

import { AppModule } from "./app/app.module";
import { appGlobalMiddleware } from "./app/useGlobal";

/**
 * 支付回调原始报文中间件。
 *
 * 微信支付 v2 使用 XML (content-type: application/xml), 默认 body parser 不解析,
 * 这里按 bytes 读入并挂到 req.rawBody, 供验签使用 (禁止用重新序列化的对象验签)。
 * JSON / urlencoded 回调的 rawBody 由 Nest 的 rawBody: true 提供。
 */
function paymentCallbackRawBody(req: Request, _res: Response, next: NextFunction) {
  const contentType = String(req.headers["content-type"] ?? "");
  if (!/xml/i.test(contentType)) return next();

  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    (req as Request & { rawBody?: Buffer }).rawBody = raw;
    (req as Request & { body?: unknown }).body = raw;
    next();
  });
  req.on("error", next);
}

async function bootstrap() {
  // rawBody: true → 保留原始报文, 支付回调验签必须基于原始字节
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use("/payment/callback", paymentCallbackRawBody);
  app.enableCors({
    origin: [
      /^http:\/\/localhost(:\d+)?$/,
      /^http:\/\/127\.0\.0\.1(:\d+)?$/,
      /^http:\/\/earthworm\.cuixueshe\.com(:81)?$/,
    ],
  });

  appGlobalMiddleware(app);
  const config = new DocumentBuilder()
    .setTitle("EarthWorm Swagger")
    .setDescription("The EarthWorm API description")
    .setVersion("v1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("/swagger", app, document);
  await app.listen(process.env.PORT || 3001);
}

bootstrap();
