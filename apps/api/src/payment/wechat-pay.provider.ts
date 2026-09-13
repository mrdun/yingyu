import { Inject, Injectable, Logger } from "@nestjs/common";

import { PAYMENT_HTTP, PaymentHttpClient } from "./payment-http.client";
import { PAYMENT_METHOD_META, PaymentMethod } from "./payment-method";
import {
  CallbackAck,
  ClosePaymentResult,
  CreatePaymentResult,
  NormalizedPayment,
  PaymentOrder,
  PaymentProvider,
  RefundResult,
} from "./payment-provider.interface";
import { buildWechatXml, parseWechatXml, verifyWechatSign, wechatSign } from "./wechat-signature";

const API_BASE = "https://api.mch.weixin.qq.com";
const UNIFIED_ORDER_PATH = "/pay/unifiedorder";
const ORDER_QUERY_PATH = "/pay/orderquery";
const ORDER_CLOSE_PATH = "/pay/closeorder";
const REFUND_PATH = "/secapi/pay/refund";
const SUCCESS = "SUCCESS";

function nonce(): string {
  return Math.random().toString(36).slice(2, 18) + Date.now().toString(36);
}

/**
 * 微信支付 Provider (v2 协议: XML + MD5/HMAC-SHA256 签名)。
 *
 * 已实现: Native(扫码)/JSAPI 下单、订单查询、关单、退款、回调验签。
 * 凭据全部来自环境变量 (WECHAT_APP_ID / WECHAT_MCH_ID / WECHAT_API_KEY / WECHAT_CERT_PATH
 * / WECHAT_CERT_KEY_PATH), 不落库; 退款需要商户 API 证书 (mTLS)。
 */
@Injectable()
export class WechatPayProvider implements PaymentProvider {
  readonly name = "wechat";
  readonly supportedMethods = ["wechat_native", "wechat_jsapi"] as const;

  private readonly logger = new Logger(WechatPayProvider.name);

  constructor(@Inject(PAYMENT_HTTP) private readonly http: PaymentHttpClient) {}

  get appId(): string {
    return process.env.WECHAT_APP_ID ?? "";
  }
  get mchId(): string {
    return process.env.WECHAT_MCH_ID ?? "";
  }
  get apiKey(): string {
    return process.env.WECHAT_API_KEY ?? "";
  }
  get notifyUrl(): string {
    const base = (process.env.PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
    return base ? `${base}/payment/callback/wechat` : "";
  }
  get merchantId(): string | undefined {
    return this.mchId || undefined;
  }
  get configured(): boolean {
    return Boolean(this.appId && this.mchId && this.apiKey && this.notifyUrl);
  }

  private ensureConfigured() {
    if (!this.appId || !this.mchId || !this.apiKey) {
      throw new Error(
        "微信支付未配置: 缺少 WECHAT_APP_ID / WECHAT_MCH_ID / WECHAT_API_KEY (见部署文档)",
      );
    }
    if (!this.notifyUrl) {
      throw new Error("微信支付未配置: 缺少 PUBLIC_API_BASE_URL (用于生成 notify_url)");
    }
  }

  private certificate() {
    const certPath = process.env.WECHAT_CERT_PATH;
    const keyPath = process.env.WECHAT_CERT_KEY_PATH;
    if (!certPath || !keyPath) return undefined;
    return {
      certPath,
      keyPath,
      ...(process.env.WECHAT_CERT_PASSPHRASE
        ? { passphrase: process.env.WECHAT_CERT_PASSPHRASE }
        : {}),
    };
  }

  /** 发送并验签微信响应 (响应签名必须通过, 否则视为失败) */
  private async call(path: string, fields: Record<string, string | number>, withCert = false) {
    const params: Record<string, string | number> = {
      appid: this.appId,
      mch_id: this.mchId,
      nonce_str: nonce(),
      ...fields,
    };
    const sign = wechatSign(params, this.apiKey, "MD5");
    const body = buildWechatXml({ ...params, sign });
    const response = await this.http.send({
      url: `${API_BASE}${path}`,
      method: "POST",
      body,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
      ...(withCert && this.certificate() ? { certificate: this.certificate() } : {}),
    });

    const parsed = parseWechatXml(response.text);
    if (Object.keys(parsed).length === 0) {
      this.logger.error(
        `微信支付调用失败: provider=${this.name} action=${path} httpStatus=${response.status} status=unparsable_response`,
      );
      throw new Error(`微信支付返回无法解析的报文 (HTTP ${response.status})`);
    }
    // 业务成功响应必须携带有效签名; 系统级失败 (return_code=FAIL) 允许无签名
    if (parsed["return_code"] === SUCCESS && !parsed["sign"]) {
      this.logger.error(
        `微信支付调用失败: provider=${this.name} action=${path} status=missing_signature`,
      );
      throw new Error("微信支付响应缺少签名, 拒绝处理");
    }
    if (parsed["sign"] && !verifyWechatSign(parsed, this.apiKey)) {
      this.logger.error(
        `微信支付调用失败: provider=${this.name} action=${path} status=invalid_signature`,
      );
      throw new Error("微信支付响应验签失败");
    }
    return parsed;
  }

  private assertSuccess(parsed: Record<string, string>, action: string) {
    if (parsed["return_code"] !== SUCCESS) {
      this.logger.error(
        `微信支付业务失败: provider=${this.name} action=${action} status=return_code_fail error=${parsed["return_msg"] ?? "unknown"}`,
      );
      throw new Error(`微信支付${action}失败: ${parsed["return_msg"] ?? "unknown"}`);
    }
    if (parsed["result_code"] && parsed["result_code"] !== SUCCESS) {
      this.logger.error(
        `微信支付业务失败: provider=${this.name} action=${action} status=result_code_fail error=${parsed["err_code"] ?? ""}`,
      );
      throw new Error(
        `微信支付${action}业务失败: ${parsed["err_code"] ?? ""} ${parsed["err_code_des"] ?? ""}`.trim(),
      );
    }
  }

  async createPayment(order: PaymentOrder, method?: string): Promise<CreatePaymentResult> {
    this.ensureConfigured();
    const resolved = (method ?? "wechat_native") as PaymentMethod;
    if (!(this.supportedMethods as readonly string[]).includes(resolved)) {
      throw new Error(`微信支付不支持该支付方式: ${method}`);
    }
    if (resolved === "wechat_jsapi" && !order.openid) {
      throw new Error("微信 JSAPI 支付需要 openid (当前用户缺少 openid, 请使用扫码支付)");
    }

    const outTradeNo = order.id;
    const parsed = await this.call(UNIFIED_ORDER_PATH, {
      body: order.description ?? `会员-${order.planId}`,
      out_trade_no: outTradeNo,
      total_fee: order.amountFen,
      spbill_create_ip: process.env.WECHAT_SPBILL_CREATE_IP ?? "127.0.0.1",
      notify_url: this.notifyUrl,
      trade_type: resolved === "wechat_jsapi" ? "JSAPI" : "NATIVE",
      ...(resolved === "wechat_jsapi"
        ? { openid: order.openid as string }
        : { product_id: outTradeNo }),
    });
    this.assertSuccess(parsed, "下单");

    // NATIVE 返回 code_url (二维码链接); JSAPI 返回 prepay_id
    const codeUrl = parsed["code_url"];
    const prepayId = parsed["prepay_id"];
    if (!codeUrl && !prepayId) {
      throw new Error("微信支付下单未返回 code_url/prepay_id");
    }

    return {
      providerOrderId: outTradeNo,
      paymentPayload: {
        provider: this.name,
        method: PAYMENT_METHOD_META[resolved].method,
        codeUrl: codeUrl ?? null,
        prepayId: prepayId ?? null,
        appId: this.appId,
        ...(resolved === "wechat_jsapi"
          ? {
              jsapiParams: {
                appId: this.appId,
                timeStamp: String(Math.floor(Date.now() / 1000)),
                nonceStr: nonce(),
                package: `prepay_id=${prepayId}`,
                signType: "MD5",
              },
            }
          : {}),
      },
    };
  }

  async queryPayment(order: PaymentOrder): Promise<NormalizedPayment> {
    this.ensureConfigured();
    const outTradeNo = order.providerOrderId ?? order.id;
    const parsed = await this.call(ORDER_QUERY_PATH, { out_trade_no: outTradeNo });
    this.assertSuccess(parsed, "订单查询");

    const tradeState = parsed["trade_state"] ?? "";
    const status: NormalizedPayment["status"] =
      tradeState === SUCCESS
        ? "paid"
        : ["NOTPAY", "USERPAYING", "REFUND"].includes(tradeState)
          ? "pending"
          : "failed";

    return {
      providerOrderId: parsed["out_trade_no"] ?? outTradeNo,
      amountFen: Number(parsed["total_fee"] ?? order.amountFen),
      currency: "CNY",
      status,
      transactionId: parsed["transaction_id"],
      merchantId: parsed["mch_id"],
    };
  }

  /** 关闭订单: 超时前先关单, 避免「用户已付款但本地 expired」 */
  async closePayment(order: PaymentOrder): Promise<ClosePaymentResult> {
    this.ensureConfigured();
    const outTradeNo = order.providerOrderId ?? order.id;
    const parsed = await this.call(ORDER_CLOSE_PATH, { out_trade_no: outTradeNo });
    if (parsed["return_code"] !== SUCCESS) {
      return { closed: false, reason: parsed["return_msg"] ?? "return_code_fail" };
    }
    if (parsed["result_code"] !== SUCCESS) {
      // ORDERPAID: 已经支付成功, 不能关单 (调用方需改为查单入账)
      return { closed: false, reason: parsed["err_code"] ?? "close_failed" };
    }
    return { closed: true };
  }

  /** 退款: 需要商户 API 证书 (mTLS) */
  async refundPayment(order: PaymentOrder, amountFen?: number): Promise<RefundResult> {
    this.ensureConfigured();
    const certificate = this.certificate();
    if (!certificate) {
      throw new Error("微信退款未配置商户证书: 需要 WECHAT_CERT_PATH / WECHAT_CERT_KEY_PATH");
    }
    const totalFen = order.amountFen;
    const refundFen = amountFen ?? totalFen;

    const outTradeNo = order.providerOrderId ?? order.id;
    const params: Record<string, string | number> = {
      appid: this.appId,
      mch_id: this.mchId,
      nonce_str: nonce(),
      out_trade_no: outTradeNo,
      // 同一订单退款单号确定化, 微信侧对同单号同金额退款幂等
      out_refund_no: `RF${outTradeNo}`.slice(0, 64),
      total_fee: totalFen,
      refund_fee: refundFen,
    };
    const body = buildWechatXml({ ...params, sign: wechatSign(params, this.apiKey, "MD5") });
    const response = await this.http.send({
      url: `${API_BASE}${REFUND_PATH}`,
      method: "POST",
      body,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
      certificate,
    });

    const parsed = parseWechatXml(response.text);
    if (parsed["sign"] && !verifyWechatSign(parsed, this.apiKey)) {
      this.logger.error(
        `微信退款失败: provider=${this.name} orderId=${order.id} status=invalid_signature`,
      );
      throw new Error("微信退款响应验签失败");
    }
    if (parsed["return_code"] !== SUCCESS || parsed["result_code"] !== SUCCESS) {
      this.logger.error(
        `微信退款失败: provider=${this.name} orderId=${order.id} status=refund_failed error=${parsed["err_code"] ?? parsed["return_msg"] ?? "unknown"}`,
      );
    }
    this.assertSuccess(parsed, "退款");

    return { refunded: true, refundId: parsed["refund_id"] };
  }

  /** 回调验签: 基于原始 XML 报文, 不使用重新序列化的对象 */
  verifyCallback(raw: string): boolean {
    if (!this.apiKey) return false;
    const parsed = parseWechatXml(raw);
    if (!parsed["sign"]) return false;
    return verifyWechatSign(parsed, this.apiKey);
  }

  parseCallback(raw: string): NormalizedPayment {
    const parsed = parseWechatXml(raw);
    const paid =
      parsed["return_code"] === SUCCESS &&
      parsed["result_code"] === SUCCESS &&
      parsed["trade_state"] === SUCCESS;

    return {
      providerOrderId: parsed["out_trade_no"] ?? "",
      amountFen: Number(parsed["total_fee"] ?? 0),
      currency: "CNY",
      status: paid ? "paid" : "failed",
      transactionId: parsed["transaction_id"],
      merchantId: parsed["mch_id"],
      raw,
    };
  }

  callbackAck(): CallbackAck {
    return {
      contentType: "application/xml; charset=utf-8",
      body: buildWechatXml({ return_code: SUCCESS, return_msg: "OK" }),
    };
  }
}
