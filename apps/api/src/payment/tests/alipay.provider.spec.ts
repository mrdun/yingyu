import { createSign, generateKeyPairSync } from "node:crypto";

import { buildAlipayRequestBody, signAlipayParams } from "../alipay-signature";
import { AlipayProvider } from "../alipay.provider";
import { PaymentHttpClient, PaymentHttpRequest } from "../payment-http.client";

const APP_ID = "2021000000000000";
const SELLER_ID = "2088000000000000";

/** 测试用 RSA 密钥对 (模拟商户私钥 + 支付宝公钥) */
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

class FakeHttp implements PaymentHttpClient {
  readonly requests: PaymentHttpRequest[] = [];
  response = "";
  status = 200;

  async send(request: PaymentHttpRequest) {
    this.requests.push(request);
    return { status: this.status, text: this.response };
  }
}

function signedResponse(nodeKey: string, node: Record<string, unknown>): string {
  const nodeJson = JSON.stringify(node);
  const sign = createSign("RSA-SHA256").update(nodeJson, "utf8").sign(privateKey, "base64");
  return `{"${nodeKey}":${nodeJson},"sign":"${sign}"}`;
}

/** 构造支付宝异步通知原始报文 (参数已 URL 编码, sign 由支付宝私钥生成) */
function notifyBody(overrides: Record<string, string> = {}): string {
  const params: Record<string, string> = {
    app_id: APP_ID,
    seller_id: SELLER_ID,
    out_trade_no: "alipay_order_1",
    total_amount: "18.00",
    trade_status: "TRADE_SUCCESS",
    trade_no: "2026000000000001",
    charset: "utf-8",
    sign_type: "RSA2",
    ...overrides,
  };
  const sign = signAlipayParams(params, privateKey);
  return buildAlipayRequestBody({ ...params, sign });
}

describe("AlipayProvider (当面付, RSA2, 假传输层)", () => {
  let http: FakeHttp;
  let provider: AlipayProvider;

  const order = {
    id: "order_1",
    userId: "u1",
    planId: "monthly",
    amountFen: 1800,
    currency: "CNY",
    providerOrderId: null as string | null,
  };

  beforeAll(() => {
    process.env.ALIPAY_APP_ID = APP_ID;
    process.env.ALIPAY_SELLER_ID = SELLER_ID;
    process.env.ALIPAY_PRIVATE_KEY = privateKey;
    process.env.ALIPAY_PUBLIC_KEY = publicKey;
    process.env.PUBLIC_API_BASE_URL = "https://api.example.com";
  });

  beforeEach(() => {
    http = new FakeHttp();
    provider = new AlipayProvider(http);
  });

  afterAll(() => {
    delete process.env.ALIPAY_APP_ID;
    delete process.env.ALIPAY_SELLER_ID;
    delete process.env.ALIPAY_PRIVATE_KEY;
    delete process.env.ALIPAY_PUBLIC_KEY;
    delete process.env.PUBLIC_API_BASE_URL;
  });

  it("pre-creates a QR payment and returns qr_code", async () => {
    http.response = signedResponse("alipay_trade_precreate_response", {
      code: "10000",
      msg: "Success",
      out_trade_no: "order_1",
      qr_code: "https://qr.alipay.com/bax01234",
    });

    const result = await provider.createPayment(order, "alipay_qr");

    expect(result.providerOrderId).toBe("order_1");
    expect(result.paymentPayload).toMatchObject({
      qrCode: "https://qr.alipay.com/bax01234",
      method: "alipay_qr",
    });
    // 请求包含签名与 biz_content 金额 (元)
    const body = http.requests[0].body as string;
    expect(body).toContain("method=alipay.trade.precreate");
    expect(body).toContain(
      encodeURIComponent(
        JSON.stringify({ out_trade_no: "order_1", total_amount: "18.00", subject: "会员-monthly" }),
      ),
    );
    expect(body).toContain("sign=");
  });

  it("rejects a tampered gateway response signature", async () => {
    http.response = `{"alipay_trade_precreate_response":{"code":"10000","qr_code":"https://qr.alipay.com/x"},"sign":"AAAA"}`;
    await expect(provider.createPayment(order, "alipay_qr")).rejects.toThrow(/验签失败/);
  });

  it("verifies a real notify signature and rejects tampering", () => {
    expect(provider.verifyCallback(notifyBody())).toBe(true);

    // 篡改金额 (签名不再匹配)
    const tampered = notifyBody().replace("total_amount=18.00", "total_amount=0.01");
    expect(provider.verifyCallback(tampered)).toBe(false);

    // 其他应用 (app_id 不匹配) 的通知即使签名有效也拒绝
    expect(provider.verifyCallback(notifyBody({ app_id: "2021999999999999" }))).toBe(false);

    // 其他商户 (seller_id 不匹配)
    expect(provider.verifyCallback(notifyBody({ seller_id: "2088999999999999" }))).toBe(false);
  });

  it("parses notify payload into normalized payment (元 → 分)", () => {
    const parsed = provider.parseCallback(notifyBody());
    expect(parsed).toMatchObject({
      providerOrderId: "alipay_order_1",
      amountFen: 1800,
      currency: "CNY",
      status: "paid",
      transactionId: "2026000000000001",
      merchantId: APP_ID,
    });
  });

  it("maps query trade_status to normalized status", async () => {
    http.response = signedResponse("alipay_trade_query_response", {
      code: "10000",
      out_trade_no: "order_1",
      total_amount: "18.00",
      trade_status: "TRADE_SUCCESS",
      trade_no: "2026000000000001",
    });
    await expect(
      provider.queryPayment({ ...order, providerOrderId: "order_1" }),
    ).resolves.toMatchObject({ status: "paid", amountFen: 1800 });

    http.response = signedResponse("alipay_trade_query_response", {
      code: "10000",
      out_trade_no: "order_1",
      total_amount: "18.00",
      trade_status: "WAIT_BUYER_PAY",
    });
    await expect(
      provider.queryPayment({ ...order, providerOrderId: "order_1" }),
    ).resolves.toMatchObject({ status: "pending" });
  });

  it("refunds with a deterministic out_request_no (防重复退款)", async () => {
    http.response = signedResponse("alipay_trade_refund_response", {
      code: "10000",
      trade_no: "2026000000000001",
      out_trade_no: "order_1",
    });

    const result = await provider.refundPayment({ ...order, providerOrderId: "order_1" });

    const body = decodeURIComponent(http.requests[0].body as string);
    expect(body).toContain('"out_request_no":"RForder_1"');
    expect(body).toContain('"refund_amount":"18.00"');
    expect(result.refunded).toBe(true);
  });

  it("reports missing credentials instead of faking success", async () => {
    delete process.env.ALIPAY_PRIVATE_KEY;
    const unconfigured = new AlipayProvider(new FakeHttp());
    expect(unconfigured.configured).toBe(false);
    await expect(unconfigured.createPayment(order, "alipay_qr")).rejects.toThrow(
      /ALIPAY_PRIVATE_KEY/,
    );
    process.env.ALIPAY_PRIVATE_KEY = privateKey;
  });

  it("accepts base64 (non-PEM) keys from environment", async () => {
    const base64Private = privateKey.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    process.env.ALIPAY_PRIVATE_KEY = base64Private;
    http.response = signedResponse("alipay_trade_precreate_response", {
      code: "10000",
      qr_code: "https://qr.alipay.com/bax01234",
    });

    const result = await provider.createPayment(order, "alipay_qr");
    expect(result.paymentPayload).toMatchObject({ qrCode: "https://qr.alipay.com/bax01234" });
    process.env.ALIPAY_PRIVATE_KEY = privateKey;
  });
});
