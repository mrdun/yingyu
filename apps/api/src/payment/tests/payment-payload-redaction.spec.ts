import { redactPaymentPayload } from "../payment-payload-redaction";

describe("支付回调报文脱敏 (task 三)", () => {
  it("masks wechat openid while keeping reconciliation fields", () => {
    const raw = `<xml><appid>wx1</appid><mch_id>190</mch_id><out_trade_no>order_1</out_trade_no><total_fee>1800</total_fee><trade_state>SUCCESS</trade_state><openid>oABCDEFGHIJKLMN</openid><sign>ABC123</sign></xml>`;

    const redacted = redactPaymentPayload(raw, "wechat");

    expect(redacted).toContain("<openid>oA***</openid>");
    expect(redacted).not.toContain("oABCDEFGHIJKLMN");
    // 对账必需字段保持不变
    expect(redacted).toContain("<out_trade_no>order_1</out_trade_no>");
    expect(redacted).toContain("<total_fee>1800</total_fee>");
    expect(redacted).toContain("<trade_state>SUCCESS</trade_state>");
    expect(redacted).toContain("<sign>ABC123</sign>");
  });

  it("masks CDATA wrapped values", () => {
    const raw = `<xml><openid><![CDATA[oCDATAOPENID123]]></openid><out_trade_no>o2</out_trade_no></xml>`;
    const redacted = redactPaymentPayload(raw, "wechat");
    expect(redacted).toContain("<![CDATA[oC***]]>");
    expect(redacted).not.toContain("oCDATAOPENID123");
  });

  it("masks alipay buyer identifiers in urlencoded notify", () => {
    const raw =
      "app_id=2021000&out_trade_no=order_9&total_amount=18.00&trade_status=TRADE_SUCCESS&buyer_id=2088112233445566&buyer_logon_id=ab***@example.com&sign=XYZ";

    const redacted = redactPaymentPayload(raw, "alipay");

    expect(redacted).toContain("buyer_id=20***");
    expect(redacted).toContain("buyer_logon_id=ab***");
    expect(redacted).not.toContain("2088112233445566");
    expect(redacted).not.toContain("ab***@example.com");
    expect(redacted).toContain("out_trade_no=order_9");
    expect(redacted).toContain("total_amount=18.00");
    expect(redacted).toContain("sign=XYZ");
  });

  it("leaves unknown providers and non-sensitive payloads untouched", () => {
    const raw = "orderId=o1&reason=close_error";
    expect(redactPaymentPayload(raw, "wechat")).toBe(raw);
    expect(redactPaymentPayload(raw, "mock")).toBe(raw);
  });
});
