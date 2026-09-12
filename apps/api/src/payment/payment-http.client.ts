import { readFileSync } from "node:fs";
import { Agent } from "node:https";

import { Injectable } from "@nestjs/common";
import axios, { AxiosRequestConfig } from "axios";

/** 商户证书 (微信退款等 mTLS 接口需要) */
export interface PaymentClientCertificate {
  certPath?: string;
  keyPath?: string;
  pfxPath?: string;
  passphrase?: string;
}

export interface PaymentHttpRequest {
  url: string;
  method?: "POST" | "GET";
  body?: string;
  headers?: Record<string, string>;
  certificate?: PaymentClientCertificate;
  timeoutMs?: number;
}

export interface PaymentHttpResponse {
  status: number;
  text: string;
}

export const PAYMENT_HTTP = Symbol("PAYMENT_HTTP");
export const PAYMENT_HTTP_TIMEOUT_MS = 15_000;

export interface PaymentHttpClient {
  send(request: PaymentHttpRequest): Promise<PaymentHttpResponse>;
}

function buildAgent(certificate?: PaymentClientCertificate): Agent | undefined {
  if (!certificate) return undefined;
  const { certPath, keyPath, pfxPath, passphrase } = certificate;
  if (pfxPath) {
    return new Agent({ pfx: readFileSync(pfxPath), passphrase });
  }
  if (certPath && keyPath) {
    return new Agent({ cert: readFileSync(certPath), key: readFileSync(keyPath), passphrase });
  }
  return undefined;
}

/** 基于 axios 的真实 HTTP 实现 (测试注入假实现, 不发起真实网络请求) */
@Injectable()
export class AxiosPaymentHttpClient implements PaymentHttpClient {
  async send(request: PaymentHttpRequest): Promise<PaymentHttpResponse> {
    const agent = buildAgent(request.certificate);
    const config: AxiosRequestConfig = {
      url: request.url,
      method: request.method ?? "POST",
      data: request.body,
      headers: request.headers,
      timeout: request.timeoutMs ?? PAYMENT_HTTP_TIMEOUT_MS,
      // 支付渠道要求原样读取响应报文 (不做 schema 校验/转换)
      responseType: "text",
      transformResponse: [(data: unknown) => data],
      validateStatus: () => true,
      ...(agent ? { httpsAgent: agent } : {}),
    };
    const response = await axios.request(config);
    return { status: response.status, text: String(response.data ?? "") };
  }
}
