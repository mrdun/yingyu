import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";

import { AuthGuard, Permissions } from "../guards/auth.guard";
import { PaymentChannelService } from "./payment-channel.service";

/**
 * 支付渠道管理 (管理员)。
 * 只暴露 enabled/configured 与支持的方式; **不返回任何商户密钥/证书内容**。
 */
@Controller("admin/payment-channels")
@UseGuards(AuthGuard)
export class PaymentChannelAdminController {
  constructor(private readonly paymentChannelService: PaymentChannelService) {}

  @Get()
  @Permissions("admin:access")
  async list() {
    return await this.paymentChannelService.listChannels();
  }

  @Patch(":provider")
  @Permissions("admin:access")
  async update(@Param("provider") provider: string, @Body() dto: { enabled?: boolean }) {
    return await this.paymentChannelService.setEnabled(provider, Boolean(dto?.enabled));
  }
}
