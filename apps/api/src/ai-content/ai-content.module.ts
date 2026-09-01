import { Module } from "@nestjs/common";

import { GlobalModule } from "../global/global.module";
import { AiContentController } from "./ai-content.controller";
import { AiContentService } from "./ai-content.service";
import { ASR_PROVIDER, WhisperAsrProvider } from "./asr-provider";

@Module({
  imports: [GlobalModule],
  providers: [
    AiContentService,
    {
      provide: ASR_PROVIDER,
      useClass: WhisperAsrProvider,
    },
  ],
  controllers: [AiContentController],
})
export class AiContentModule {}
