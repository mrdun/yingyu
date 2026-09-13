import { Module } from "@nestjs/common";

import { LogtoModule } from "../logto/logto.module";
import { HealthController } from "./health.controller";

/** 健康检查模块 (只读, 无业务逻辑; 供 LB 探针与发布 smoke test 使用) */
@Module({
  imports: [LogtoModule],
  controllers: [HealthController],
})
export class HealthModule {}
