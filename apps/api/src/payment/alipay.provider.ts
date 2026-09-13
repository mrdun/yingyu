import { Inject, Injectable, Logger } from "@nestjs/common";

import {
  buildAlipayRequestBody,
  parseAlipayRequestBody,
  resolvePrivateKey,
  resolvePublicKey,
  signAlipayParams,
  verifyAlipayParams,
  verifyAlipayResponse,
} from "./alipay-signature";
import { PAYMENT_HTTP, PaymentHttpClient } from "./payment-http.client";
import { fenToYuan, yuanToFen } from "./payment-money";
import {
  CallbackAck,
  ClosePaymentResult,
  CreatePaymentResult,
  NormalizedPayment,
  PaymentOrder,
  PaymentProvider,
  RefundResult,
} from "./payment-provider.interface";

const PRECREATE = "alipay.trade.precreate";
const QUERY = "alipay.trade.query";
const CLOSE = "alipay.trade.close";
const REFUND = "alipay.trade.refund";

/**
 * 支付宝 Provider (当面付/扫码支付, RSA2 签名)。
 *
 * 已实现: 预下单(二维码)、订单查询、关单、退款、异步通知验签。
 * 凭据全部来自环境变量 (ALIPAY_APP_ID / ALIPAY_PRIVATE_KEY / ALIPAY_PUBLIC_KEY
 * / ALIPAY_SELLER_ID / ALIPAY_GATEWAY), 不落库。
 */
@Injectable()
export class AlipayProvider implements PaymentProvider {
  readonly name = "alipay";
  readonly supportedMethods = ["alipay_qr"] as const;

  private readonly logger = new Logger(AlipayProvider.name);

  constructor(@Inject(PAYMENT_HTTP) private readonly http: PaymentHttpClient) {}

  get appId(): string {
    return process.env.ALIPAY_APP_ID ?? "";
  }
  get sellerId(): string {
    return process.env.ALIPAY_SELLER_ID ?? "";
  }
  get gateway(): string {
    return process.env.ALIPAY_GATEWAY ?? "https://openapi.alipay.com/gateway.do";
  }
  get notifyUrl(): string {
    const base = (process.env.PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
    return base ? `${base}/payment/callback/alipay` : "";
  }
  /** 商户校验以 app_id 为准 (seller_id 可选二次校验) */
  get merchantId(): string | undefined {
    return this.appId || undefined;
  }
  get configured(): boolean {
    return Boolean(
      this.appId &&
        this.notifyUrl &&
        resolvePrivateKey(process.env.ALIPAY_PRIVATE_KEY ?? "") &&
        resolvePublicKey(process.env.ALIPAY_PUBLIC_KEY ?? ""),
    );
  }

  private privateKey(): string {
    const key = resolvePrivateKey(process.env.ALIPAY_PRIVATE_KEY ?? "");
    if (!key) {
      throw new Error("支付宝未配置: ALIPAY_PRIVATE_KEY 缺失或格式无法解析 (PEM/base64)");
    }
    return key;
  }

  private publicKey(): string | null {
    return resolvePublicKey(process.env.ALIPAY_PUBLIC_KEY ?? "");
  }

  private ensureConfigured() {
    if (!this.appId) throw new Error("支付宝未配置: 缺少 ALIPAY_APP_ID");
    if (!this.notifyUrl) throw new Error("支付宝未配置: 缺少 PUBLIC_API_BASE_URL");
    this.privateKey();
  }

  /** 调用网关接口: 公共参数 + biz_content, RSA2 签名 */
  private async call<P extends object>(
    method: string,
    bizContent: Record<string, unknown>,
  ): Promise<P> {
    this.ensureConfigured();
    const params: Record<string, string> = {
      app_id: this.appId,
      method,
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
      version: "1.0",
      notify_url: this.notifyUrl,
      biz_content: JSON.stringify(bizContent),
    };
    const signed = { ...params, sign: signAlipayParams(params, this.privateKey()) };

    const response = await this.http.send({
      url: this.gateway,
      method: "POST",
      body: buildAlipayRequestBody(signed),
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    });

    const nodeKey = `${method.replace(/\./g, "_")}_response`;
    const publicKey = this.publicKey();
    // 支付宝错误响应使用 error_response 节点; 验签对象必须与响应节点一致,
    // 否则会把「业务错误」误报成「验签失败」, 掩盖真实原因。
    const signedNodeKey = response.text.includes(`"${nodeKey}"`) ? nodeKey : "error_response";
    if (publicKey && !verifyAlipayResponse(response.text, signedNodeKey, publicKey)) {
      this.logger.error(
        `支付宝调用失败: provider=${this.name} action=${method} httpStatus=${response.status} status=invalid_signature`,
      );
      throw new Error(`支付宝 ${method} 响应验签失败`);
    }

    let payload: { [key: string]: P & { code?: string; msg?: string; sub_msg?: string } };
    try {
      payload = JSON.parse(response.text);
    } catch {
      this.logger.error(
        `支付宝调用失败: provider=${this.name} action=${method} httpStatus=${response.status} status=unparsable_response`,
      );
      throw new Error(`支付宝 ${method} 返回无法解析的报文 (HTTP ${response.status})`);
    }
    const node = payload[nodeKey];
    if (!node) {
      const errorNode = (payload as Record<string, { sub_msg?: string; msg?: string }>)
        .error_response;
      this.logger.error(
        `支付宝调用失败: provider=${this.name} action=${method} status=error_response error=${errorNode?.sub_msg ?? errorNode?.msg ?? "unknown"}`,
      );
      throw new Error(
        `支付宝 ${method} 调用失败: ${errorNode?.sub_msg ?? errorNode?.msg ?? "unknown"}`,
      );
    }
    if (node.code && node.code !== "10000") {
      this.logger.error(
        `支付宝业务失败: provider=${this.name} action=${method} status=business_error error=${node.sub_msg ?? node.msg ?? node.code}`,
      );
      throw new Error(`支付宝 ${method} 业务失败: ${node.sub_msg ?? node.msg ?? node.code}`);
    }
    return node;
  }

  async createPayment(order: PaymentOrder, method?: string): Promise<CreatePaymentResult> {
    if (method && !(this.supportedMethods as readonly string[]).includes(method)) {
      throw new Error(`支付宝不支持该支付方式: ${method}`);
    }

    const node = await this.call<{ qr_code?: string; out_trade_no?: string }>(PRECREATE, {
      out_trade_no: order.id,
      total_amount: fenToYuan(order.amountFen),
      subject: order.description ?? `会员-${order.planId}`,
    });
    if (!node.qr_code) {
      throw new Error("支付宝预下单未返回 qr_code");
    }

    return {
      providerOrderId: order.id,
      paymentPayload: {
        provider: this.name,
        method: "alipay_qr",
        qrCode: node.qr_code,
      },
    };
  }

  async queryPayment(order: PaymentOrder): Promise<NormalizedPayment> {
    const outTradeNo = order.providerOrderId ?? order.id;
    const node = await this.call<{
      out_trade_no?: string;
      total_amount?: string;
      trade_status?: string;
      trade_no?: string;
    }>(QUERY, { out_trade_no: outTradeNo });

    const tradeStatus = node.trade_status ?? "";
    const status: NormalizedPayment["status"] =
      tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED"
        ? "paid"
        : tradeStatus === "WAIT_BUYER_PAY"
          ? "pending"
          : "failed";

    return {
      providerOrderId: node.out_trade_no ?? outTradeNo,
      amountFen: node.total_amount ? yuanToFen(node.total_amount) : order.amountFen,
      currency: "CNY",
      status,
      transactionId: node.trade_no,
      merchantId: this.appId,
    };
  }

  async closePayment(order: PaymentOrder): Promise<ClosePaymentResult> {
    const outTradeNo = order.providerOrderId ?? order.id;
    const node = await this.call<{ out_trade_no?: string }>(CLOSE, { out_trade_no: outTradeNo });
    return { closed: Boolean(node.out_trade_no) };
  }

  async refundPayment(order: PaymentOrder, amountFen?: number): Promise<RefundResult> {
    const outTradeNo = order.providerOrderId ?? order.id;
    const node = await this.call<{ trade_no?: string; out_trade_no?: string }>(REFUND, {
      out_trade_no: outTradeNo,
      refund_amount: fenToYuan(amountFen ?? order.amountFen),
      // 同一订单退款请求号确定化: 支付宝对相同 out_request_no 幂等, 防止重复退款
      out_request_no: `RF${outTradeNo}`.slice(0, 64),
    });
    return { refunded: true, refundId: node.trade_no ?? node.out_trade_no };
  }

  /** 异步通知验签: 基于原始 urlencoded 报文解析出的参数 */
  verifyCallback(raw: string): boolean {
    const publicKey = this.publicKey();
    if (!publicKey) return false;
    const params = parseAlipayRequestBody(raw);
    if (!params["sign"]) return false;
    if (!verifyAlipayParams(params, publicKey)) return false;
    // 商户校验: app_id 必须匹配; 配置了 seller_id 时一并校验
    if (params["app_id"] && params["app_id"] !== this.appId) return false;
    if (this.sellerId && params["seller_id"] && params["seller_id"] !== this.sellerId) return false;
    return true;
  }

  parseCallback(raw: string): NormalizedPayment {
    const params = parseAlipayRequestBody(raw);
    const tradeStatus = params["trade_status"] ?? "";
    let amountFen = 0;
    try {
      amountFen = params["total_amount"] ? yuanToFen(params["total_amount"]) : 0;
    } catch {
      amountFen = 0; // 非法金额交由业务层金额校验拒绝
    }

    return {
      providerOrderId: params["out_trade_no"] ?? "",
      amountFen,
      currency: "CNY",
      status:
        tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED" ? "paid" : "failed",
      transactionId: params["trade_no"],
      merchantId: params["app_id"],
      raw,
    };
  }

  callbackAck(): CallbackAck {
    return { contentType: "text/plain; charset=utf-8", body: "success" };
  }
}
