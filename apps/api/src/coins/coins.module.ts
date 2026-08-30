import { Module } from "@nestjs/common";

import { GlobalModule } from "../global/global.module";
import { CoinsContext } from "./coins.context";
import { CoinsController } from "./coins.controller";
import { CoinsService } from "./coins.service";

@Module({
  imports: [GlobalModule],
  providers: [CoinsContext, CoinsService],
  controllers: [CoinsController],
})
export class CoinsModule {}
