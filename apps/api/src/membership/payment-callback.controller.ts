import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
} from "@nestjs/common";

import { PAYMENT_PROVIDER, PaymentProvider } from "../payment/payment-provider.interface";
import { MembershipService } from "./membership.service";

/**
 * 支付回调统一入口: 验签 → 解析 → 订单/金额/币种/状态校验 → markOrderPaid。
 * 不依赖用户登录, 依靠 Provider signature 认证。
 */
@Controller("payment/callback")
export class PaymentCallbackController {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly membershipService: MembershipService,
  ) {}

  @Post(":provider")
  async handle(
    @Param("provider") provider: string,
    @Body() body: Record<string, unknown>,
    @Headers("x-signature") signature?: string,
  ) {
    if (provider !== this.provider.name) {
      throw new BadRequestException(`Unknown payment provider: ${provider}`);
    }

    const raw = JSON.stringify(body);
    if (!this.provider.verifyCallback(raw, signature ?? "")) {
      throw new UnauthorizedException("Invalid payment signature");
    }

    const payment = this.provider.parseCallback(body);
    const order = await this.membershipService.findOrderByProviderOrderId(payment.providerOrderId);
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    if (order.amountFen !== payment.amountFen) {
      throw new BadRequestException("Payment amount mismatch");
    }
    if (order.currency !== payment.currency) {
      throw new BadRequestException("Payment currency mismatch");
    }
    if (payment.status !== "paid") {
      return { ok: true, status: payment.status };
    }

    await this.membershipService.markOrderPaid(order.id);
    return { ok: true, status: "paid" };
  }
}
