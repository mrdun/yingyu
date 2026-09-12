import {
  BadRequestException,
  Controller,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { Request, Response } from "express";

import { PAYMENT_PROVIDERS } from "../payment/payment-provider.interface";
import { PaymentProviderRegistry } from "../payment/payment-provider.registry";
import { MembershipService } from "./membership.service";

/** 回调报文最大留存长度 (审计用) */
const PAYLOAD_AUDIT_LIMIT = 4096;

/**
 * 原始报文提取: 验签必须基于原始字节, 禁止使用 JSON.stringify(解析后的对象)。
 * 生产环境由 main.ts 的回调原始报文中间件写入 req.rawBody。
 */
export function extractRawBody(req: { rawBody?: unknown; body?: unknown }): string {
  const rawBody = (req as { rawBody?: unknown }).rawBody;
  if (Buffer.isBuffer(rawBody)) return rawBody.toString("utf8");
  if (typeof rawBody === "string") return rawBody;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (typeof req.body === "string") return req.body;
  throw new BadRequestException(
    "Raw request body is required for signature verification (body parser must not pre-parse callbacks)",
  );
}

/**
 * 支付回调统一入口: raw body → 验签 → 解析 → 订单/商户/金额/币种校验 → payment_event → markOrderPaid。
 * 不依赖用户登录, 依靠渠道签名认证; **回调绝不允许直接改会员状态**, 只能走 markOrderPaid。
 */
@Controller("payment/callback")
export class PaymentCallbackController {
  private readonly logger = new Logger(PaymentCallbackController.name);

  constructor(
    @Inject(PAYMENT_PROVIDERS) private readonly registry: PaymentProviderRegistry,
    private readonly membershipService: MembershipService,
  ) {}

  @Post(":provider")
  async handle(@Param("provider") providerName: string, @Req() req: Request, @Res() res: Response) {
    const provider = this.registry.get(providerName);
    const raw = extractRawBody(req);

    if (!provider.verifyCallback(raw)) {
      this.logger.warn(`支付回调验签失败: provider=${providerName}`);
      throw new UnauthorizedException("Invalid payment signature");
    }

    const payment = provider.parseCallback(raw);
    const order = await this.membershipService.findOrderByProviderOrderId(payment.providerOrderId);
    if (!order) {
      this.logger.error(
        `支付回调找不到订单: provider=${providerName} providerOrderId=${payment.providerOrderId}`,
      );
      throw new NotFoundException("Order not found");
    }

    // 商户校验: 防止其他商户/应用的回调串号
    if (provider.merchantId && payment.merchantId && provider.merchantId !== payment.merchantId) {
      this.logger.error(
        `支付回调商户不匹配: provider=${providerName} expected=${provider.merchantId} actual=${payment.merchantId}`,
      );
      throw new BadRequestException("Merchant mismatch");
    }
    if (order.amountFen !== payment.amountFen) {
      throw new BadRequestException("Payment amount mismatch");
    }
    if (order.currency !== payment.currency) {
      throw new BadRequestException("Payment currency mismatch");
    }

    if (payment.status !== "paid") {
      // 非成功通知 (例如支付宝 WAIT_BUYER_PAY): 确认收到, 不激活会员
      return this.ack(provider.callbackAck().contentType, provider.callbackAck().body, res);
    }

    // 事件记录 (幂等: 同订单+事件类型+payload hash 只处理一次)
    const event = await this.membershipService.recordPaymentEvent({
      orderId: order.id,
      provider: provider.name,
      eventType: "callback",
      payload: raw.slice(0, PAYLOAD_AUDIT_LIMIT),
    });
    if (!event.isNew) {
      this.logger.log(`支付回调重复, 已忽略: order=${order.id} provider=${provider.name}`);
      return this.ack(provider.callbackAck().contentType, provider.callbackAck().body, res);
    }

    await this.membershipService.markOrderPaid(order.id, {
      transactionId: payment.transactionId,
      paymentMethod: order.paymentMethod ?? undefined,
    });
    await this.membershipService.markPaymentEventProcessed(event.id);

    return this.ack(provider.callbackAck().contentType, provider.callbackAck().body, res);
  }

  private ack(contentType: string, body: string, res: Response) {
    res.status(200).type(contentType).send(body);
  }
}
