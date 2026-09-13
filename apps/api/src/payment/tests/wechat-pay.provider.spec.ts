import { Logger } from "@nestjs/common";

import { PaymentHttpClient, PaymentHttpRequest } from "../payment-http.client";
import { WechatPayProvider } from "../wechat-pay.provider";
import { buildWechatXml, parseWechatXml, wechatSign } from "../wechat-signature";

const APP_ID = "wx_unit_test";
const MCH_ID = "1900000001";
const API_KEY = "unit-test-api-key-32-characters-x";

/** 假传输层: 记录请求并返回给定 XML (签名使用真实算法) */
class FakeHttp implements PaymentHttpClient {
  readonly requests: PaymentHttpRequest[] = [];
  response = "";
  status = 200;

  async send(request: PaymentHttpRequest) {
    this.requests.push(request);
    return { status: this.status, text: this.response };
  }
}

function signedWechatResponse(fields: Record<string, string | number>): string {
  const params = { appid: APP_ID, mch_id: MCH_ID, return_code: "SUCCESS", ...fields };
  return buildWechatXml({ ...params, sign: wechatSign(params, API_KEY, "MD5") });
}

describe("WechatPayProvider (v2 协议, 假传输层)", () => {
  let http: FakeHttp;
  let provider: WechatPayProvider;

  const order = {
    id: "order_1",
    userId: "u1",
    planId: "monthly",
    amountFen: 1800,
    currency: "CNY",
    providerOrderId: null as string | null,
  };

  beforeAll(() => {
    process.env.WECHAT_APP_ID = APP_ID;
    process.env.WECHAT_MCH_ID = MCH_ID;
    process.env.WECHAT_API_KEY = API_KEY;
    process.env.PUBLIC_API_BASE_URL = "https://api.example.com";
  });

  beforeEach(() => {
    http = new FakeHttp();
    provider = new WechatPayProvider(http);
  });

  afterAll(() => {
    delete process.env.WECHAT_APP_ID;
    delete process.env.WECHAT_MCH_ID;
    delete process.env.WECHAT_API_KEY;
    delete process.env.PUBLIC_API_BASE_URL;
    delete process.env.WECHAT_CERT_PATH;
    delete process.env.WECHAT_CERT_KEY_PATH;
  });

  it("creates a NATIVE payment and returns the signed code_url", async () => {
    http.response = signedWechatResponse({
      result_code: "SUCCESS",
      trade_type: "NATIVE",
      code_url: "weixin://wxpay/bizpayurl?pr=abc",
    });

    const result = await provider.createPayment(order, "wechat_native");

    const message = parseWechatXml(http.requests[0].body as string);
    expect(message.trade_type).toBe("NATIVE");
    expect(message.out_trade_no).toBe("order_1");
    expect(message.total_fee).toBe("1800");
    expect(message.notify_url).toBe("https://api.example.com/payment/callback/wechat");
    expect(message.sign).toBeTruthy();
    expect(result.providerOrderId).toBe("order_1");
    expect(result.paymentPayload).toMatchObject({
      codeUrl: "weixin://wxpay/bizpayurl?pr=abc",
      method: "wechat_native",
    });
  });

  it("requires openid for JSAPI and returns prepay_id when provided", async () => {
    await expect(provider.createPayment(order, "wechat_jsapi")).rejects.toThrow(/openid/);

    http.response = signedWechatResponse({ result_code: "SUCCESS", prepay_id: "prepay_1" });
    const result = await provider.createPayment({ ...order, openid: "openid_1" }, "wechat_jsapi");

    const message = parseWechatXml(http.requests[0].body as string);
    expect(message.trade_type).toBe("JSAPI");
    expect(message.openid).toBe("openid_1");
    expect(result.paymentPayload).toMatchObject({ prepayId: "prepay_1" });
  });

  it("rejects an unsigned or invalid response signature", async () => {
    http.response = buildWechatXml({
      return_code: "SUCCESS",
      result_code: "SUCCESS",
      code_url: "weixin://x",
    });
    await expect(provider.createPayment(order, "wechat_native")).rejects.toThrow(/签名/);

    http.response = buildWechatXml({
      return_code: "SUCCESS",
      result_code: "SUCCESS",
      code_url: "weixin://x",
      sign: "DEADBEEF",
    });
    await expect(provider.createPayment(order, "wechat_native")).rejects.toThrow(/验签失败/);
  });

  it("maps query results to normalized status", async () => {
    http.response = signedWechatResponse({
      result_code: "SUCCESS",
      trade_state: "SUCCESS",
      total_fee: 1800,
      transaction_id: "txn_9",
    });
    await expect(
      provider.queryPayment({ ...order, providerOrderId: "order_1" }),
    ).resolves.toMatchObject({ status: "paid", amountFen: 1800, transactionId: "txn_9" });

    http.response = signedWechatResponse({
      result_code: "SUCCESS",
      trade_state: "NOTPAY",
      total_fee: 1800,
    });
    await expect(
      provider.queryPayment({ ...order, providerOrderId: "order_1" }),
    ).resolves.toMatchObject({ status: "pending" });
  });

  it("closes an unpaid order and reports the reason when the order is already paid", async () => {
    http.response = signedWechatResponse({ result_code: "SUCCESS" });
    await expect(provider.closePayment({ ...order, providerOrderId: "order_1" })).resolves.toEqual({
      closed: true,
    });

    http.response = signedWechatResponse({
      result_code: "FAIL",
      err_code: "ORDERPAID",
      err_code_des: "order paid",
    });
    await expect(provider.closePayment({ ...order, providerOrderId: "order_1" })).resolves.toEqual({
      closed: false,
      reason: "ORDERPAID",
    });
  });

  it("requires merchant certificate for refunds and refunds with mTLS when configured", async () => {
    await expect(provider.refundPayment({ ...order, providerOrderId: "order_1" })).rejects.toThrow(
      /WECHAT_CERT_PATH/,
    );

    process.env.WECHAT_CERT_PATH = "test-cert.pem";
    process.env.WECHAT_CERT_KEY_PATH = "test-key.pem";
    http.response = signedWechatResponse({
      result_code: "SUCCESS",
      refund_id: "refund_1",
      out_refund_no: "RForder_1",
    });

    const result = await provider.refundPayment({ ...order, providerOrderId: "order_1" });
    const message = parseWechatXml(http.requests[0].body as string);
    expect(message.out_trade_no).toBe("order_1");
    expect(message.total_fee).toBe("1800");
    expect(message.refund_fee).toBe("1800");
    expect(http.requests[0].certificate).toMatchObject({ certPath: "test-cert.pem" });
    expect(result).toEqual({ refunded: true, refundId: "refund_1" });
  });

  it("reports unconfigured credentials instead of faking success", async () => {
    delete process.env.WECHAT_API_KEY;
    const unconfigured = new WechatPayProvider(new FakeHttp());
    expect(unconfigured.configured).toBe(false);
    await expect(unconfigured.createPayment(order, "wechat_native")).rejects.toThrow(
      /WECHAT_API_KEY/,
    );
    process.env.WECHAT_API_KEY = API_KEY;
  });

  it("never leaks credentials in failure logs", async () => {
    const messages: string[] = [];
    const spy = jest.spyOn(Logger.prototype, "error").mockImplementation((message: unknown) => {
      messages.push(String(message));
    });

    try {
      http.response = buildWechatXml({
        return_code: "SUCCESS",
        result_code: "SUCCESS",
        code_url: "weixin://x",
        sign: "BAD_SIGNATURE",
      });
      await expect(provider.createPayment(order, "wechat_native")).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }

    const logged = messages.join("\n");
    expect(logged).toContain("provider=wechat");
    expect(logged).toContain("status=invalid_signature");
    expect(logged).not.toContain(API_KEY);
    expect(logged).not.toContain("code_url");
  });
});
