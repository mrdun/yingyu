import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";

import { isProduction } from "../common/env";
import { AuthGuard, Permissions, UncheckAuth } from "../guards/auth.guard";
import { PAYMENT_PROVIDER, PaymentProvider } from "../payment/payment-provider.interface";
import { User, UserEntity } from "../user/user.decorators";
import { CreateOrderDto } from "./dto/create-order.dto";
import { MembershipService } from "./membership.service";
import { findPlan } from "./plans";

@Controller("membership")
export class MembershipController {
  constructor(
    private readonly membershipService: MembershipService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  @Permissions("write:membership")
  @UseGuards(AuthGuard)
  @Post("buy")
  async buyMembership(@Body() buyMembershipDto: any) {
    return await this.membershipService.upsert(new Date(), buyMembershipDto);
  }

  /**
   * 创建会员购买订单 (模拟支付流程)
   */
  @UseGuards(AuthGuard)
  @Post("orders")
  async createOrder(@User() user: UserEntity, @Body() dto: CreateOrderDto) {
    const plan = findPlan(dto.planId);
    if (!plan) {
      throw new HttpException("Invalid planId", HttpStatus.BAD_REQUEST);
    }

    const result = await this.paymentProvider.createOrder(user.userId, plan.id);

    const providerOrderId = result.orderId;
    await this.membershipService.createOrder({
      userId: user.userId,
      planId: plan.id,
      amountFen: plan.priceFen,
      provider: "mock",
      providerOrderId,
    });

    return {
      orderId: providerOrderId,
      payUrl: result.payUrl,
      amountFen: plan.priceFen,
    };
  }

  /**
   * 查询订单状态; Mock 模式下订单超过 10 秒自动置为 paid (模拟支付回调),
   * 置 paid 时同时开通/延长会员并写金币流水留痕。
   */
  @UseGuards(AuthGuard)
  @Get("orders/:orderId")
  async getOrder(@User() user: UserEntity, @Param("orderId") orderId: string) {
    // orderId 可能是 DB 内部 id 或 providerOrderId (create 返回的 mock_xxx)
    let order = await this.membershipService.findOrder(orderId);
    if (!order) {
      order = await this.membershipService.findOrderByProviderOrderId(orderId);
    }
    if (!order || order.userId !== user.userId) {
      throw new HttpException("Order not found", HttpStatus.NOT_FOUND);
    }

    let status = order.status;
    if (status === "pending" && order.provider === "mock" && order.providerOrderId) {
      const result = await this.paymentProvider.queryOrder(order.providerOrderId);
      if (result.status === "paid") {
        await this.membershipService.markOrderPaid(order.id);
        status = "paid";
      }
    }

    return {
      orderId: order.id,
      planId: order.planId,
      amountFen: order.amountFen,
      status,
      paidAt: order.paidAt,
      createdAt: order.createdAt,
    };
  }

  /**
   * 模拟支付页 (无鉴权, 仅 dev; 生产删除 MockProvider 时一并删除)
   * GET /membership/mock-pay/:orderId?confirm=1
   */
  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get("mock-pay/:orderId")
  async mockPay(
    @Param("orderId") orderId: string,
    @Query("confirm") confirm: string,
    @Res() res: Response,
  ) {
    // 生产环境禁止访问模拟支付
    if (isProduction()) {
      throw new NotFoundException();
    }

    const order = await this.membershipService.findOrderByProviderOrderId(orderId);
    if (!order) {
      res.status(404).send("<h1>order not found</h1>");
      return;
    }
    if (confirm === "1" && order.status === "pending") {
      await this.membershipService.markPaidByProviderOrderId(orderId);
    }
    res.type("html").send(
      `<html><body style="font-family:sans-serif;text-align:center;padding-top:80px">
        <h1>✅ 模拟支付成功</h1>
        <p>订单 ${orderId} 已确认支付, 会员已开通。</p>
        <p>此页面仅用于开发环境的模拟支付, 生产环境不存在。</p>
      </body></html>`,
    );
  }

  /**
   * 当前用户会员状态
   */
  @UseGuards(AuthGuard)
  @Get("status")
  async status(@User() user: UserEntity) {
    return await this.membershipService.getMembershipStatus(user.userId);
  }

  /**
   * 当前用户会员状态 (权益判定入口, 语义同 /status)
   */
  @UseGuards(AuthGuard)
  @Get("my")
  async my(@User() user: UserEntity) {
    return await this.membershipService.getMembershipStatus(user.userId);
  }
}
