import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { businessSettings } from "@earthworm/schema";
import { isProduction } from "../common/env";
import { DB, DbType } from "../global/providers/db.provider";
import { PAYMENT_METHOD_META, PaymentMethod, PaymentMethodMeta } from "./payment-method";
import { PaymentProviderRegistry } from "./payment-provider.registry";

export interface PaymentChannelView {
  provider: string;
  enabled: boolean;
  /** 环境变量凭据是否齐全 (只返回布尔, 不返回任何密钥) */
  configured: boolean;
  methods: PaymentMethodMeta[];
}

const CHANNEL_KEYS: Record<string, string> = {
  wechat: "payment_wechat_enabled",
  alipay: "payment_alipay_enabled",
};
const DEFAULT_ORDER_EXPIRE_MINUTES = 120;

/**
 * 支付渠道开关 (数据库只保存 enabled/disabled 状态)。
 * 商户密钥/证书只来自环境变量, 任何接口都不返回密钥内容。
 */
@Injectable()
export class PaymentChannelService {
  constructor(
    @Inject(DB) private readonly db: DbType,
    private readonly registry: PaymentProviderRegistry,
  ) {}

  private async getBoolean(key: string, fallback: boolean): Promise<boolean> {
    const row = await this.db.query.businessSettings.findFirst({
      where: eq(businessSettings.key, key),
    });
    if (!row) return fallback;
    return row.value === "true";
  }

  async isEnabled(provider: string): Promise<boolean> {
    const key = CHANNEL_KEYS[provider];
    if (!key) return provider === "mock" && !isProduction();
    return await this.getBoolean(key, false);
  }

  async setEnabled(provider: string, enabled: boolean): Promise<PaymentChannelView> {
    const key = CHANNEL_KEYS[provider];
    if (!key) {
      throw new BadRequestException(`Unsupported payment provider: ${provider}`);
    }
    await this.db
      .insert(businessSettings)
      .values({ key, value: enabled ? "true" : "false" })
      .onConflictDoUpdate({
        target: businessSettings.key,
        set: { value: enabled ? "true" : "false" },
      });
    return await this.view(provider);
  }

  /** 管理端渠道列表 (不含任何密钥) */
  async listChannels(): Promise<PaymentChannelView[]> {
    return await Promise.all(this.registry.list().map((provider) => this.view(provider.name)));
  }

  private async view(providerName: string): Promise<PaymentChannelView> {
    const provider = this.registry.get(providerName);
    return {
      provider: provider.name,
      enabled: await this.isEnabled(provider.name),
      configured: provider.configured,
      methods: this.methodsOf(provider.name),
    };
  }

  private methodsOf(providerName: string): PaymentMethodMeta[] {
    return Object.values(PAYMENT_METHOD_META).filter((meta) => meta.provider === providerName);
  }

  /**
   * 用户端可用的支付方式: 渠道已开启 + 凭据已配置。
   * mock 仅非生产环境可用。
   */
  async availableMethods(): Promise<PaymentMethodMeta[]> {
    const available: PaymentMethodMeta[] = [];
    for (const provider of this.registry.list()) {
      const enabled = await this.isEnabled(provider.name);
      if (!enabled || !provider.configured) continue;
      available.push(...this.methodsOf(provider.name));
    }
    return available;
  }

  async isMethodAvailable(method: PaymentMethod): Promise<boolean> {
    const available = await this.availableMethods();
    return available.some((meta) => meta.method === method);
  }

  /** 订单支付超时时间 (分钟), 来自 business_settings */
  async orderExpireMinutes(): Promise<number> {
    const row = await this.db.query.businessSettings.findFirst({
      where: eq(businessSettings.key, "order_expire_minutes"),
    });
    const parsed = row ? Number(row.value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ORDER_EXPIRE_MINUTES;
  }
}
