/**
 * 支付方式 (下单时显式指定)。
 * 规则: 每个支付方式唯一归属一个 Provider; 订单的 provider 由支付方式决定, 避免
 * 「订单 provider 与实际收款渠道不一致」导致的回调/退款错配。
 */
export const PAYMENT_METHODS = ["mock", "wechat_native", "wechat_jsapi", "alipay_qr"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface PaymentMethodMeta {
  method: PaymentMethod;
  provider: string;
  label: string;
  /** 是否为扫码支付 (前端展示二维码/支付链接) */
  qr: boolean;
}

export const PAYMENT_METHOD_META: Record<PaymentMethod, PaymentMethodMeta> = {
  mock: { method: "mock", provider: "mock", label: "模拟支付 (仅开发)", qr: false },
  wechat_native: {
    method: "wechat_native",
    provider: "wechat",
    label: "微信支付 (扫码)",
    qr: true,
  },
  wechat_jsapi: {
    method: "wechat_jsapi",
    provider: "wechat",
    label: "微信支付 (公众号/小程序)",
    qr: false,
  },
  alipay_qr: { method: "alipay_qr", provider: "alipay", label: "支付宝 (扫码)", qr: true },
};

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

export function providerOfMethod(method: PaymentMethod): string {
  return PAYMENT_METHOD_META[method].provider;
}

export function methodsOfProvider(provider: string): PaymentMethod[] {
  return PAYMENT_METHODS.filter((method) => PAYMENT_METHOD_META[method].provider === provider);
}
