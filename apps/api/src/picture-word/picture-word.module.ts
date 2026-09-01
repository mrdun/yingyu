import { Module } from "@nestjs/common";

import { PictureWordController } from "./picture-word.controller";
import { PictureWordService } from "./picture-word.service";

@Module({
  providers: [PictureWordService],
  controllers: [PictureWordController],
})
export class PictureWordModule {}
