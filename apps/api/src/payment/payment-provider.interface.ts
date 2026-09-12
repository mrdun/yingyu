/**
 * 支付抽象层: 业务层只依赖统一 PaymentProvider, 不直接依赖微信/支付宝 SDK。
 * Provider 负责第三方协议、签名、请求/响应解析; markOrderPaid/refundOrder 仍是
 * 唯一业务激活/退款入口。
 *
 * 安全约定:
 * - 回调验签必须基于 **原始报文 (raw body)**, 禁止 JSON.stringify(body) 后再验签。
 * - 金额/币种/商户号必须在业务层与本地订单比对后才允许 markOrderPaid。
 */

export type PaymentOrderStatus = "pending" | "paid" | "failed";

/** 传给 Provider 的完整订单上下文 (金额/币种由服务端 DB 派生) */
export interface PaymentOrder {
  id: string;
  userId: string;
  planId: string;
  amountFen: number;
  currency: string;
  providerOrderId: string | null;
  /** 商品描述 (微信 body / 支付宝 subject) */
  description?: string;
  /** 微信 JSAPI 支付必需 (公众号/小程序 openid) */
  openid?: string;
}

export interface CreatePaymentResult {
  providerOrderId: string;
  /** QR code / redirect URL / client payment params */
  paymentPayload?: unknown;
  /** 第三方订单失效时间 (若第三方返回) */
  expiresAt?: Date;
}

/** 归一化的第三方支付结果 (callback/query 统一) */
export interface NormalizedPayment {
  providerOrderId: string;
  amountFen: number;
  currency: string;
  status: PaymentOrderStatus;
  transactionId?: string;
  /** 第三方商户标识 (微信 mch_id / 支付宝 app_id) 用于商户校验 */
  merchantId?: string;
  /** 原始报文 (审计用) */
  raw?: string;
}

export interface RefundResult {
  refunded: boolean;
  /** 第三方退款单号 */
  refundId?: string;
}

export interface ClosePaymentResult {
  closed: boolean;
  /** closed=false 时的原因 (例如第三方面单已支付) */
  reason?: string;
}

/** 回调应答: 不同渠道要求的响应体不同 (微信 XML / 支付宝纯文本) */
export interface CallbackAck {
  contentType: string;
  body: string;
}

export interface PaymentProvider {
  readonly name: string;
  /** 支持的支付方式 */
  readonly supportedMethods: readonly string[];
  /** 部署级商户标识 (用于回调商户校验); 未配置时为 undefined */
  readonly merchantId?: string;
  /** 凭据是否已通过环境变量配置 (不暴露任何密钥内容) */
  readonly configured: boolean;

  createPayment(order: PaymentOrder, method?: string): Promise<CreatePaymentResult>;
  queryPayment(order: PaymentOrder): Promise<NormalizedPayment>;
  /** 关闭第三方面单 (订单超时前调用, 避免「已付款但本地 expired」) */
  closePayment(order: PaymentOrder): Promise<ClosePaymentResult>;
  /** 验签 (Provider 协议层, 只接受原始报文) */
  verifyCallback(raw: string): boolean;
  /** 解析并归一化 callback (只接受原始报文) */
  parseCallback(raw: string): NormalizedPayment;
  refundPayment(order: PaymentOrder, amountFen?: number): Promise<RefundResult>;
  /** 回调成功应答体 */
  callbackAck(): CallbackAck;
}

export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");
/** Provider 注册表 (按订单 provider 路由回调/退款/关单) */
export const PAYMENT_PROVIDERS = Symbol("PAYMENT_PROVIDERS");
