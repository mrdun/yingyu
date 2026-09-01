import { Controller, Get, UseGuards } from "@nestjs/common";

import { AuthGuard, UncheckAuth } from "../guards/auth.guard";
import { PictureWordService } from "./picture-word.service";

@Controller("picture-word")
export class PictureWordController {
  constructor(private readonly pictureWordService: PictureWordService) {}

  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get()
  findAll() {
    return this.pictureWordService.findAll();
  }
}
