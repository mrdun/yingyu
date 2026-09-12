import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from "@nestjs/common";

import { AuthGuard, Permissions } from "../guards/auth.guard";
import { BusinessSettingsService } from "./business-settings.service";

@Controller("admin/business-settings")
@UseGuards(AuthGuard)
export class BusinessSettingsController {
  constructor(private readonly businessSettingsService: BusinessSettingsService) {}

  @Get()
  @Permissions("admin:access")
  async list() {
    return await this.businessSettingsService.getAll();
  }

  @Patch(":key")
  @Permissions("admin:access")
  async update(@Param("key") key: string, @Body() dto: { value: string }) {
    if (dto?.value === undefined || dto.value === null || `${dto.value}`.trim() === "") {
      throw new BadRequestException("value is required");
    }
    return await this.businessSettingsService.set(key, `${dto.value}`);
  }
}
