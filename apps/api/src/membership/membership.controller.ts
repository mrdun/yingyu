import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";

import { isProduction } from "../common/env";
import { AuthGuard, Permissions, UncheckAuth } from "../guards/auth.guard";
import { PaymentChannelService } from "../payment/payment-channel.service";
import { isPaymentMethod, PaymentMethod } from "../payment/payment-method";
import {
  PAYMENT_PROVIDER,
  PAYMENT_PROVIDERS,
  PaymentProvider,
} from "../payment/payment-provider.interface";
import { PaymentProviderRegistry } from "../payment/payment-provider.registry";
import { PlansService } from "../plans/plans.service";
import { User, UserEntity } from "../user/user.decorators";
import { CreateOrderDto } from "./dto/create-order.dto";
import { MembershipService } from "./membership.service";
import { OrderStatus } from "./types/order-status";

@Controller("membership")
export class MembershipController {
  constructor(
    private readonly membershipService: MembershipService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
    private readonly plansService: PlansService,
    @Optional()
    @Inject(PAYMENT_PROVIDERS)
    private readonly paymentProviders?: PaymentProviderRegistry,
    @Optional() private readonly paymentChannelService?: PaymentChannelService,
  ) {}

  private providerOf(method: PaymentMethod): PaymentProvider {
    return this.paymentProviders?.resolveMethod(method) ?? this.paymentProvider;
  }

  private async resolvePaymentMethod(requested?: string): Promise<PaymentMethod> {
    if (requested) {
      if (!isPaymentMethod(requested)) {
        throw new HttpException(`Unsupported paymentMethod: ${requested}`, HttpStatus.BAD_REQUEST);
      }
      if (
        this.paymentChannelService &&
        !(await this.paymentChannelService.isMethodAvailable(requested))
      ) {
        throw new HttpException(
          `Payment method is not available: ${requested}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      return requested;
    }

    const available = this.paymentChannelService
      ? await this.paymentChannelService.availableMethods()
      : [];
    const fallback = available[0]?.method;
    if (!fallback) {
      throw new HttpException(
        "No payment method is available (channels disabled or not configured)",
        HttpStatus.BAD_REQUEST,
      );
    }
    return fallback;
  }

  /** 可用支付方式 (游客可读: 前端据此渲染支付方式选择) */
  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get("payment-methods")
  async paymentMethods() {
    if (!this.paymentChannelService) {
      return [{ method: "mock", provider: "mock", label: "模拟支付 (仅开发)", qr: false }];
    }
    return await this.paymentChannelService.availableMethods();
  }

  @Permissions("admin:access")
  @UseGuards(AuthGuard)
  @Post("buy")
  async buyMembership(@Body() buyMembershipDto: any) {
    return await this.membershipService.upsert(new Date(), buyMembershipDto);
  }

  /**
   * 创建会员购买订单:
   * 选择 plan → 选择支付方式 → 内部订单(金额=DB plan) → Provider.createPayment(order, method)
   * → 回填 providerOrderId → 返回支付参数(二维码/JSAPI 参数)。
   */
  @UseGuards(AuthGuard)
  @Post("orders")
  async createOrder(@User() user: UserEntity, @Body() dto: CreateOrderDto) {
    const plan = await this.plansService.findById(dto.planId);
    if (!plan) {
      throw new HttpException("Invalid planId", HttpStatus.BAD_REQUEST);
    }
    if (!plan.isActive) {
      throw new HttpException("Plan is not available for purchase", HttpStatus.BAD_REQUEST);
    }

    const method = await this.resolvePaymentMethod(dto.paymentMethod);
    const provider = this.providerOf(method);

    const order = await this.membershipService.createOrder({
      userId: user.userId,
      planId: plan.id,
      provider: provider.name,
      paymentMethod: method,
      idempotencyKey: dto.idempotencyKey,
    });

    // 幂等命中已有订单且已回填 providerOrderId 时, 复用原支付参数, 不再重复下单
    const payment = order.providerOrderId
      ? { providerOrderId: order.providerOrderId, paymentPayload: undefined, expiresAt: undefined }
      : await provider.createPayment(
          {
            id: order.id,
            userId: order.userId,
            planId: order.planId,
            amountFen: order.amountFen,
            currency: order.currency,
            providerOrderId: order.providerOrderId,
            description: `会员-${plan.name}`,
          },
          method,
        );

    if (!order.providerOrderId) {
      await this.membershipService.setProviderOrderId(order.id, payment.providerOrderId);
    }

    return {
      orderId: order.id,
      providerOrderId: payment.providerOrderId,
      paymentMethod: method,
      paymentPayload: payment.paymentPayload,
      amountFen: order.amountFen,
      expiresAt: await this.membershipService.getOrderExpiresAt(order),
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
    // 轮询兜底: 回调丢失时主动查单 (金额/币种必须与本地一致才入账)
    const synced = await this.membershipService.syncOrderWithProvider(order.id);
    status = synced?.status ?? status;

    return {
      orderId: order.id,
      planId: order.planId,
      amountFen: order.amountFen,
      status,
      paymentMethod: order.paymentMethod,
      providerOrderId: order.providerOrderId,
      expiresAt: await this.membershipService.getOrderExpiresAt(order),
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
    if (confirm === "1" && order.status === OrderStatus.PENDING) {
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
