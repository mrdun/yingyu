import { Module } from "@nestjs/common";

import { GlobalModule } from "../global/global.module";
import { AiContentController } from "./ai-content.controller";
import { AiContentService } from "./ai-content.service";

@Module({
  imports: [GlobalModule],
  providers: [AiContentService],
  controllers: [AiContentController],
})
export class AiContentModule {}
