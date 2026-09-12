import { createHash } from "node:crypto";

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { and, desc, eq, gte, isNull, lt, lte } from "drizzle-orm";

import {
  businessSettings,
  coinTransactions,
  membership,
  membershipPeriod,
  orders,
  paymentEvent,
  plans,
} from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";
import { PartnerService } from "../partner/partner.service";
import {
  PAYMENT_PROVIDER,
  PAYMENT_PROVIDERS,
  PaymentProvider,
} from "../payment/payment-provider.interface";
import { PaymentProviderRegistry } from "../payment/payment-provider.registry";
import { BuyMembershipDto, MembershipPeriod } from "./dto/buy-membership.dto";
import { MembershipType } from "./types/membership.types";
import { OrderStatus } from "./types/order-status";

@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);
  constructor(
    @Inject(DB) private db: DbType,
    private readonly partnerService: PartnerService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
    @Optional()
    @Inject(PAYMENT_PROVIDERS)
    private readonly paymentProviders?: PaymentProviderRegistry,
  ) {}

  /**
   * 按订单 provider 解析渠道 (回调/退款/关单必须走订单自己的渠道)。
   * 未注册注册表时回退到注入的默认 Provider (兼容既有单渠道部署与测试)。
   */
  private resolveProvider(providerName?: string): PaymentProvider {
    if (!providerName) return this.paymentProvider;
    try {
      return this.paymentProviders?.get(providerName) ?? this.paymentProvider;
    } catch {
      return this.paymentProvider;
    }
  }

  /** 查询 DB plans (金额/时长唯一可信来源) */
  private async getPlan(planId: string, db: DbType = this.db) {
    return await db.query.plans.findFirst({
      where: eq(plans.id, planId),
    });
  }

  /** 结算币种 (商业参数, 缺省 CNY) */
  private async getCurrency(): Promise<string> {
    const row = await this.db.query.businessSettings.findFirst({
      where: eq(businessSettings.key, "currency"),
    });
    return row?.value?.trim() || "CNY";
  }

  /** 订单支付超时时间 (分钟, 商业参数, 缺省 120) */
  async orderExpireMinutes(): Promise<number> {
    const row = await this.db.query.businessSettings.findFirst({
      where: eq(businessSettings.key, "order_expire_minutes"),
    });
    const parsed = row ? Number(row.value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 120;
  }

  /** 订单过期时间 (供前端倒计时/展示) */
  async getOrderExpiresAt(order: { createdAt: Date }): Promise<Date> {
    const minutes = await this.orderExpireMinutes();
    return new Date(order.createdAt.getTime() + minutes * 60 * 1000);
  }

  /**
   * 管理员赠送会员 (plan 驱动, 不产生 order/payment/membership_period)。
   * 与普通购买 (/membership/orders) 严格区分: 这是 grant, 不是 buy。
   */
  async grantMembership(userId: string, planId: string) {
    const plan = await this.getPlan(planId);
    if (!plan) {
      throw new BadRequestException(`Invalid planId: ${planId}`);
    }
    if (!plan.isActive) {
      throw new BadRequestException(`Plan ${planId} is not available`);
    }

    const now = new Date();
    const membershipEntity = await this.findMembership(userId);
    const startAt =
      membershipEntity?.end_date && membershipEntity.end_date > now
        ? membershipEntity.end_date
        : now;
    const endAt =
      plan.durationDays == null
        ? null
        : new Date(startAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    if (!membershipEntity) {
      await this.db.insert(membership).values({
        userId,
        start_date: now,
        end_date: endAt,
        isActive: true,
        status: "active",
        planId,
      });
    } else {
      await this.db
        .update(membership)
        .set({ end_date: endAt, status: "active", planId, isActive: true, updatedAt: new Date() })
        .where(eq(membership.userId, userId));
    }

    return { userId, planId, startDate: startAt, endDate: endAt };
  }

  async upsert(startDate: Date, buyMembershipDto: BuyMembershipDto) {
    const { userId } = buyMembershipDto;

    const membershipEntity = await this.findMembership(userId);

    if (membershipEntity && membershipEntity.isActive) {
      // 如果用户是激活状态的会员，则延长会员期限
      const endDate = this.calculateEndDate(membershipEntity.end_date, buyMembershipDto);
      await this.db
        .update(membership)
        .set({
          end_date: endDate,
        })
        .where(eq(membership.userId, userId));

      this.logger.log(`Membership for user ${userId} extend end date to ${endDate}`);

      return { endDate, startDate, isActive: true };
    } else {
      // 如果用户不是会员或会员已过期，则创建新会员或重置会员期限
      const endDate = this.calculateEndDate(startDate, buyMembershipDto);

      if (!membershipEntity) {
        // 如果用户不是会员，则创建新会员记录
        await this.db.insert(membership).values({
          userId,
          start_date: startDate,
          end_date: endDate,
          isActive: true,
        });

        this.logger.log(`Membership for user ${userId} has been created`);
      } else {
        await this.db
          .update(membership)
          .set({ end_date: endDate, isActive: true, start_date: startDate })
          .where(eq(membership.userId, userId));

        this.logger.log(`Membership for user ${userId} has been updated`);
      }

      return { endDate, startDate, isActive: true };
    }
  }

  private async findMembership(userId: string, db: DbType = this.db) {
    const result = await db.select().from(membership).where(eq(membership.userId, userId));
    return result[0];
  }

  private calculateEndDate(startDate: Date, buyMembershipDto: BuyMembershipDto) {
    const { period, duration } = buyMembershipDto;
    const endDate = new Date(startDate);
    if (period === MembershipPeriod.MONTH) {
      endDate.setMonth(endDate.getMonth() + Number(duration));
    } else if (period === MembershipPeriod.YEAR) {
      endDate.setFullYear(endDate.getFullYear() + Number(duration));
    }
    return endDate;
  }

  /**
   * 会员数据迁移: 旧模型 (type + isActive) → 新模型 (plan_id + status + end_date)。
   * 幂等 (只处理 plan_id 为 null 的记录)。供测试与一次性迁移使用。
   */
  async migrateLegacyMemberships() {
    // 确保 legacy_regular 计划存在 (无法推断时长的 regular 会员兜底)
    await this.db
      .insert(plans)
      .values({
        id: "legacy_regular",
        name: "旧版普通会员",
        priceFen: 0,
        durationDays: null,
        sortOrder: 99,
        isActive: false,
      })
      .onConflictDoNothing({ target: plans.id });

    // founder → lifetime (永久会员, end_date = null)
    await this.db
      .update(membership)
      .set({ planId: "lifetime", status: "active", end_date: null })
      .where(and(eq(membership.type, "founder"), isNull(membership.planId)));

    // regular → 按 end_date - start_date 推断计划
    const regularMembers = await this.db
      .select()
      .from(membership)
      .where(and(eq(membership.type, "regular"), isNull(membership.planId)));

    for (const m of regularMembers) {
      const planId =
        m.end_date == null
          ? "legacy_regular"
          : this.inferPlanId(
              Math.round((m.end_date.getTime() - m.start_date.getTime()) / (24 * 60 * 60 * 1000)),
            );
      await this.db
        .update(membership)
        .set({ planId, status: "active" })
        .where(eq(membership.id, m.id));
    }

    return { migrated: regularMembers.length };
  }

  private inferPlanId(durationDays: number): string {
    if (durationDays >= 27 && durationDays <= 32) return "monthly";
    if (durationDays >= 88 && durationDays <= 93) return "quarterly";
    if (durationDays >= 360 && durationDays <= 370) return "yearly";
    return "legacy_regular";
  }

  /**
   * 为历史已支付订单回填 membership_periods (best-effort)。
   * 历史 stacking 无法可靠还原, 这里用近似区间 (start_at=paid_at, end_at=paid_at+durationDays);
   * 幂等 (按 order_id 唯一)。无法用硬编码计划还原的订单 (lifetime/legacy) 跳过并记录限制。
   */
  async backfillMembershipPeriods() {
    const paidOrders = await this.db
      .select()
      .from(orders)
      .where(eq(orders.status, OrderStatus.PAID));
    let backfilled = 0;
    let skipped = 0;
    for (const order of paidOrders) {
      const plan = await this.getPlan(order.planId);
      if (!plan) {
        skipped++;
        continue;
      }
      const m = await this.findMembership(order.userId);
      if (!m) {
        skipped++;
        continue;
      }
      const startAt = order.paidAt ?? order.createdAt;
      const endAt =
        plan.durationDays == null
          ? null
          : new Date(startAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
      const inserted = await this.db
        .insert(membershipPeriod)
        .values({
          membershipId: m.id,
          orderId: order.id,
          planId: order.planId,
          startAt,
          endAt,
          status: "active",
        })
        .onConflictDoNothing({ target: membershipPeriod.orderId })
        .returning({ id: membershipPeriod.id });
      if (inserted.length > 0) backfilled++;
    }
    return { backfilled, skipped };
  }

  async isMember(userId: string): Promise<boolean> {
    const result = await this.db.query.membership.findFirst({
      where: eq(membership.userId, userId),
    });

    if (!result) return false;

    // 新模型: status=active 且 (永久 end_date=null 或 未过期), 替代 isActive
    return result.status === "active" && (result.end_date === null || result.end_date > new Date());
  }

  /**
   * 当前用户会员状态 (供 /membership/status 与 /membership/my)
   */
  async getMembershipStatus(userId: string) {
    const result = await this.db.query.membership.findFirst({
      where: eq(membership.userId, userId),
    });

    const isMember = Boolean(
      result?.status === "active" && (result.end_date === null || result.end_date > new Date()),
    );
    return {
      isMember,
      type: result?.type ?? null,
      planId: result?.planId ?? null,
      startDate: isMember ? result.start_date : null,
      endDate: isMember ? result.end_date : null,
    };
  }

  /**
   * 订单支付成功后开通/延长会员, 并为该订单创建一条明确的权益 period。
   * start_at = 当前有效 end (若已过期则为 now), end_at = start_at + durationDays (永久 = null)。
   */
  async activateForDays(
    userId: string,
    durationDays: number | null,
    planId: string,
    orderId: string,
    tx?: DbType,
  ) {
    const db = tx ?? this.db;
    const now = new Date();
    const membershipEntity = await this.findMembership(userId, db);

    let membershipId: string;
    let effectiveEnd: Date | null = null;

    if (!membershipEntity) {
      const [created] = await db
        .insert(membership)
        .values({
          userId,
          start_date: now,
          end_date: null,
          isActive: true,
          status: "active",
          planId,
        })
        .returning();
      membershipId = created.id;
    } else {
      membershipId = membershipEntity.id;
      effectiveEnd = await this.computeEffectiveEnd(membershipId, db);
    }

    const startAt = effectiveEnd && effectiveEnd > now ? effectiveEnd : now;
    const endAt =
      durationDays == null
        ? null
        : new Date(startAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

    await db.insert(membershipPeriod).values({
      membershipId,
      orderId,
      planId,
      startAt,
      endAt,
      status: "active",
    });

    const newEffectiveEnd = await this.computeEffectiveEnd(membershipId, db);
    await db
      .update(membership)
      .set({ end_date: newEffectiveEnd, status: "active", planId, updatedAt: new Date() })
      .where(eq(membership.id, membershipId));

    this.logger.log(`Membership for user ${userId} activated until ${endAt ?? "permanent"}`);
    return { startDate: startAt, endDate: endAt, isActive: true };
  }

  /** 当前有效 end = 所有 active period 的最大 end_at; 存在永久 period 时为 null */
  private async computeEffectiveEnd(
    membershipId: string,
    db: DbType = this.db,
  ): Promise<Date | null> {
    const periods = await db
      .select()
      .from(membershipPeriod)
      .where(
        and(eq(membershipPeriod.membershipId, membershipId), eq(membershipPeriod.status, "active")),
      );
    if (periods.length === 0) return null;
    if (periods.some((p) => p.endAt == null)) return null; // 永久
    let maxEnd = periods[0].endAt!;
    for (const p of periods) {
      if (p.endAt && p.endAt > maxEnd) maxEnd = p.endAt;
    }
    return maxEnd;
  }

  private async hasActivePeriod(membershipId: string, db: DbType = this.db): Promise<boolean> {
    const periods = await db
      .select({ id: membershipPeriod.id })
      .from(membershipPeriod)
      .where(
        and(eq(membershipPeriod.membershipId, membershipId), eq(membershipPeriod.status, "active")),
      );
    return periods.length > 0;
  }

  /**
   * 创建订单记录。
   * 金额以服务端 DB plans.price_fen 为唯一可信来源 (不接受客户端金额)。
   * 支持幂等: 同用户 + 同 idempotencyKey 返回同一订单。
   */
  async createOrder(input: {
    userId: string;
    planId: string;
    provider: string;
    /** 支付方式 (wechat_native / alipay_qr / mock ...), 与 provider 一一对应 */
    paymentMethod?: string;
    providerOrderId?: string;
    idempotencyKey?: string;
    /** 可选覆盖 (仅测试/内部使用; 正常链路由 DB plan.price_fen 派生, controller 不传) */
    amountFen?: number;
  }) {
    const plan = await this.getPlan(input.planId);
    if (!plan) {
      throw new BadRequestException(`Invalid planId: ${input.planId}`);
    }
    if (!plan.isActive) {
      throw new BadRequestException(`Plan ${input.planId} is not available`);
    }

    const amountFen = input.amountFen ?? plan.priceFen;
    const currency = await this.getCurrency();

    const [inserted] = await this.db
      .insert(orders)
      .values({
        userId: input.userId,
        planId: input.planId,
        amountFen,
        status: "pending",
        provider: input.provider,
        paymentMethod: input.paymentMethod ?? null,
        currency,
        providerOrderId: input.providerOrderId ?? null,
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      })
      .onConflictDoNothing({ target: [orders.userId, orders.idempotencyKey] })
      .returning();

    if (inserted) return inserted;

    // 幂等冲突: 返回已有订单
    const existing = await this.db.query.orders.findFirst({
      where: and(eq(orders.userId, input.userId), eq(orders.idempotencyKey, input.idempotencyKey)),
    });
    return existing!;
  }

  /** 支付创建后回填 Provider 订单号 */
  async setProviderOrderId(orderId: string, providerOrderId: string) {
    const [updated] = await this.db
      .update(orders)
      .set({ providerOrderId, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
  }

  async findOrder(orderId: string) {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId));
    return order;
  }

  async listOrders(
    params: {
      limit?: number;
      status?: string;
      provider?: string;
      userId?: string;
      from?: Date;
      to?: Date;
    } = {},
  ) {
    const conditions = [];
    if (params.status) conditions.push(eq(orders.status, params.status));
    if (params.provider) conditions.push(eq(orders.provider, params.provider));
    if (params.userId) conditions.push(eq(orders.userId, params.userId));
    if (params.from) conditions.push(gte(orders.createdAt, params.from));
    if (params.to) conditions.push(lte(orders.createdAt, params.to));
    const where = conditions.length ? and(...conditions) : undefined;

    return await this.db.query.orders.findMany({
      where,
      orderBy: desc(orders.createdAt),
      limit: params.limit ?? 50,
    });
  }

  async findOrderByProviderOrderId(providerOrderId: string) {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.providerOrderId, providerOrderId));
    return order;
  }

  /** 记录支付事件 (幂等, 同 order+eventType+payloadHash 只记录一次) */
  async recordPaymentEvent(input: {
    orderId: string;
    provider: string;
    eventType: string;
    payload: string;
  }) {
    const payloadHash = createHash("sha256").update(input.payload).digest("hex");
    const [inserted] = await this.db
      .insert(paymentEvent)
      .values({
        orderId: input.orderId,
        provider: input.provider,
        eventType: input.eventType,
        payloadHash,
        payload: input.payload,
      })
      .onConflictDoNothing({
        target: [paymentEvent.orderId, paymentEvent.eventType, paymentEvent.payloadHash],
      })
      .returning({ id: paymentEvent.id });
    return inserted ? { isNew: true, id: inserted.id } : { isNew: false };
  }

  /** 标记支付事件已处理 */
  async markPaymentEventProcessed(eventId: string) {
    await this.db
      .update(paymentEvent)
      .set({ processedAt: new Date() })
      .where(eq(paymentEvent.id, eventId));
  }

  /**
   * markOrderPaid 的 providerOrderId 版本 (mock-pay 页使用)
   */
  async markPaidByProviderOrderId(providerOrderId: string) {
    const order = await this.findOrderByProviderOrderId(providerOrderId);
    if (order) {
      await this.markOrderPaid(order.id);
    }
  }

  /**
   * 订单支付成功后的业务动作: 开通/延长会员 + 金币流水留痕 + 佣金生成。
   * meta 用于记录第三方交易号/支付方式 (对账与退款使用)。
   */
  async markOrderPaid(orderId: string, meta?: { transactionId?: string; paymentMethod?: string }) {
    await this.db.transaction(async (tx) => {
      // 行锁: 并发下只有一个事务能读到 pending 并推进到 paid
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
      // 幂等: pending/processing 可转 paid; 已 paid/refunded/cancelled/expired 直接返回
      if (
        !order ||
        (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PROCESSING)
      ) {
        return;
      }

      await tx
        .update(orders)
        .set({
          status: OrderStatus.PAID,
          paidAt: new Date(),
          updatedAt: new Date(),
          ...(meta?.transactionId ? { providerTransactionId: meta.transactionId } : {}),
          ...(meta?.paymentMethod ? { paymentMethod: meta.paymentMethod } : {}),
        })
        .where(eq(orders.id, orderId));

      const plan = await this.getPlan(order.planId, tx);
      if (plan) {
        await this.activateForDays(order.userId, plan.durationDays, plan.id, order.id, tx);
      }

      // 金币流水留痕 (不加减金币, amount=0)
      await tx.insert(coinTransactions).values({
        userId: order.userId,
        amount: 0,
        reason: "membership_purchase",
        relatedId: orderId,
      });

      // 支付成功后生成 Partner 佣金 (若该用户被归因)
      await this.partnerService.generateCommissionForOrder(order, tx);
    });
  }

  /** 标记订单处理中 (callback 已收到, 正在校验) */
  async markOrderProcessing(orderId: string) {
    const order = await this.findOrder(orderId);
    if (!order || order.status !== OrderStatus.PENDING) return;
    await this.db
      .update(orders)
      .set({ status: OrderStatus.PROCESSING, updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.status, OrderStatus.PENDING)));
  }

  /**
   * 轮询兜底: 回调可能丢失, 前端轮询时主动向渠道查单。
   * 只有金额/币种与本地订单完全一致才会入账; 查询失败只记日志, 不影响本地状态。
   */
  async syncOrderWithProvider(orderId: string) {
    const order = await this.findOrder(orderId);
    if (!order || order.status !== OrderStatus.PENDING || !order.providerOrderId) {
      return order;
    }

    const provider = this.resolveProvider(order.provider);
    try {
      const result = await provider.queryPayment(this.toPaymentOrder(order));
      if (result.status !== "paid") return order;

      if (result.amountFen !== order.amountFen || result.currency !== order.currency) {
        this.logger.error(
          `查单金额/币种不一致, 拒绝入账: order=${order.id} expected=${order.amountFen}${order.currency} actual=${result.amountFen}${result.currency}`,
        );
        return order;
      }

      await this.markOrderPaid(order.id, { transactionId: result.transactionId });
      return await this.findOrder(orderId);
    } catch (error) {
      this.logger.warn(`查单失败: order=${order.id} ${(error as Error).message}`);
      return order;
    }
  }

  /** 把订单置为 expired (CAS: 只有 pending 能过期) */
  private async markOrderExpired(orderId: string) {
    const [updated] = await this.db
      .update(orders)
      .set({ status: OrderStatus.EXPIRED, updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.status, OrderStatus.PENDING)))
      .returning();
    return updated;
  }

  private toPaymentOrder(order: typeof orders.$inferSelect) {
    return {
      id: order.id,
      userId: order.userId,
      planId: order.planId,
      amountFen: order.amountFen,
      currency: order.currency,
      providerOrderId: order.providerOrderId,
    };
  }

  /** 关单失败/异常时留痕, 供人工对账 (不静默) */
  private async recordReconcileEvent(orderId: string, provider: string, reason: string) {
    try {
      await this.recordPaymentEvent({
        orderId,
        provider,
        eventType: "expire_reconcile",
        payload: reason,
      });
    } catch (error) {
      this.logger.error(`记录对账事件失败: order=${orderId} ${(error as Error).message}`);
    }
  }

  /**
   * 订单超时关闭 (幂等, 不删除订单)。
   *
   * 顺序: 先关闭第三方面单 → 再置 expired。
   * - 关单成功: pending → expired
   * - 关单失败可能是「用户已付款」: 查单确认, 已付款则走 markOrderPaid (避免已付款却 expired)
   * - 无法确认: 保持 pending 并记录 expire_reconcile 事件, 交给人工对账
   */
  async expireOrder(orderId: string): Promise<{ status: string; reason?: string }> {
    const order = await this.findOrder(orderId);
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (order.status !== OrderStatus.PENDING) {
      return { status: order.status };
    }

    // 尚未向第三方下单 (createPayment 未完成), 无三方单可关
    if (!order.providerOrderId) {
      await this.markOrderExpired(order.id);
      return { status: OrderStatus.EXPIRED };
    }

    const provider = this.resolveProvider(order.provider);
    try {
      const closed = await provider.closePayment(this.toPaymentOrder(order));
      if (closed.closed) {
        await this.markOrderExpired(order.id);
        return { status: OrderStatus.EXPIRED };
      }

      const queried = await provider.queryPayment(this.toPaymentOrder(order));
      if (
        queried.status === "paid" &&
        queried.amountFen === order.amountFen &&
        queried.currency === order.currency
      ) {
        await this.markOrderPaid(order.id, { transactionId: queried.transactionId });
        return { status: OrderStatus.PAID, reason: "paid_at_provider" };
      }

      await this.recordReconcileEvent(
        order.id,
        order.provider,
        `close_failed:${closed.reason ?? "unknown"};query:${queried.status}`,
      );
      return { status: OrderStatus.PENDING, reason: "requires_reconciliation" };
    } catch (error) {
      this.logger.error(
        `关单失败, 订单保持 pending 待对账: order=${order.id} ${(error as Error).message}`,
      );
      await this.recordReconcileEvent(
        order.id,
        order.provider,
        `close_error:${(error as Error).message}`,
      );
      return { status: OrderStatus.PENDING, reason: "requires_reconciliation" };
    }
  }

  /** 批量关闭超时 pending 订单 (定时任务调用): 先关单再过期 */
  async expirePendingOrders(before: Date, limit = 200) {
    const candidates = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.status, OrderStatus.PENDING), lt(orders.createdAt, before)))
      .limit(limit);

    let expired = 0;
    let paid = 0;
    let requiresReconciliation = 0;
    for (const candidate of candidates) {
      try {
        const result = await this.expireOrder(candidate.id);
        if (result.status === OrderStatus.EXPIRED) expired++;
        else if (result.status === OrderStatus.PAID) paid++;
        else requiresReconciliation++;
      } catch (error) {
        requiresReconciliation++;
        this.logger.error(`订单超时处理失败: order=${candidate.id} ${(error as Error).message}`);
      }
    }
    return { scanned: candidates.length, expired, paid, requiresReconciliation };
  }

  /** 定时任务: 关闭超时未支付订单 (默认每 10 分钟; 阈值读 business_settings) */
  @Cron("*/10 * * * *")
  async closeExpiredOrdersJob() {
    const minutes = await this.orderExpireMinutes();
    const before = new Date(Date.now() - minutes * 60 * 1000);
    const result = await this.expirePendingOrders(before);
    if (result.scanned > 0) {
      this.logger.log(
        `订单超时处理: scanned=${result.scanned} expired=${result.expired} paid=${result.paid} reconcile=${result.requiresReconciliation}`,
      );
    }
  }

  /**
   * 退款 (仅管理员后台触发):
   *   1) 事务内锁定订单并置 refunding (抢占, 防并发重复退款)
   *   2) 调用第三方退款 (失败则回滚为 paid, 允许后续重试)
   *   3) 事务内置 refunded + 撤销本订单会员权益 + 撤销本订单佣金
   *
   * refunded 后不能再次激活会员 (markOrderPaid 只处理 pending/processing)。
   */
  async refundOrder(orderId: string) {
    const order = await this.findOrder(orderId);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException(
        order.status === OrderStatus.REFUNDING
          ? "退款处理中, 请勿重复提交"
          : "Only paid orders can be refunded",
      );
    }

    // 1) 抢占: paid -> refunding (行锁 + CAS, 并发下只有一个请求能拿到)
    const claimed = await this.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
      if (!locked || locked.status !== OrderStatus.PAID) {
        throw new BadRequestException("Only paid orders can be refunded");
      }
      const [updated] = await tx
        .update(orders)
        .set({ status: OrderStatus.REFUNDING, updatedAt: new Date() })
        .where(eq(orders.id, orderId))
        .returning();
      await tx
        .insert(paymentEvent)
        .values({
          orderId: order.id,
          provider: order.provider,
          eventType: "refund_requested",
          payloadHash: createHash("sha256").update(`${order.id}:refund`).digest("hex"),
        })
        .onConflictDoNothing({
          target: [paymentEvent.orderId, paymentEvent.eventType, paymentEvent.payloadHash],
        });
      return updated;
    });

    // 2) 第三方退款: 使用订单自己的渠道
    const provider = this.resolveProvider(claimed.provider);
    try {
      const result = await provider.refundPayment({
        id: claimed.id,
        userId: claimed.userId,
        planId: claimed.planId,
        amountFen: claimed.amountFen,
        currency: claimed.currency,
        providerOrderId: claimed.providerOrderId,
      });
      if (!result.refunded) {
        throw new BadRequestException("Provider refund was rejected");
      }
    } catch (error) {
      // 回滚抢占状态, 允许管理员修正后重试
      await this.db
        .update(orders)
        .set({ status: OrderStatus.PAID, updatedAt: new Date() })
        .where(and(eq(orders.id, orderId), eq(orders.status, OrderStatus.REFUNDING)));
      this.logger.error(
        `第三方退款失败, 订单恢复 paid: order=${orderId} ${(error as Error).message}`,
      );
      throw error;
    }

    // 3) 本地退款收尾 (幂等: 只有 refunding 能进入 refunded)
    return await this.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
      if (!locked) {
        throw new NotFoundException(`Order ${orderId} not found`);
      }
      if (locked.status !== OrderStatus.REFUNDING) {
        if (locked.status === OrderStatus.REFUNDED) return locked; // 幂等返回
        throw new BadRequestException(`Illegal refund state: ${locked.status}`);
      }

      const [updated] = await tx
        .update(orders)
        .set({ status: OrderStatus.REFUNDED, refundedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(orders.id, orderId), eq(orders.status, OrderStatus.REFUNDING)))
        .returning();

      // 精确撤销本订单产生的会员权益 period
      await this.revokePeriodByOrderId(locked.id, tx);

      // 撤销本订单产生的佣金 (holding/pending/payable/paid → reversed)
      await this.partnerService.reverseCommissionForOrder(locked.id, tx);

      return updated;
    });
  }

  /**
   * 通过 order_id 精确撤销该订单产生的权益 period, 并重算会员有效 end。
   * 永久会员 period (end_at=null) 同样会被标记 revoked。
   */
  private async revokePeriodByOrderId(orderId: string, tx?: DbType) {
    const db = tx ?? this.db;
    const [period] = await db
      .select()
      .from(membershipPeriod)
      .where(eq(membershipPeriod.orderId, orderId))
      .for("update");
    if (!period) return; // 无 period (历史数据未回填), 跳过

    await db
      .update(membershipPeriod)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(eq(membershipPeriod.id, period.id));

    const membershipId = period.membershipId;
    const newEffectiveEnd = await this.computeEffectiveEnd(membershipId, db);
    const active = await this.hasActivePeriod(membershipId, db);
    await db
      .update(membership)
      .set({
        end_date: newEffectiveEnd,
        status: active ? "active" : "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(membership.id, membershipId));
  }

  async getMembershipDetails(userId: string) {
    const result = await this.db.query.membership.findFirst({
      columns: {
        end_date: true,
        type: true,
        start_date: true,
      },
      where: and(eq(membership.userId, userId), eq(membership.status, "active")),
    });

    if (!result) return;

    return {
      startDate: result.start_date,
      endDate: result.end_date,
      type: result.type,
    };
  }

  public async isFounderMembership(userId: string) {
    // 创始会员永久有效 所以不需要检查 active
    const result = await this.db.query.membership.findFirst({
      where: and(eq(membership.userId, userId), eq(membership.type, MembershipType.FOUNDER)),
    });

    return Boolean(result);
  }

  @Cron("0 0 * * *")
  async deactivateExpiredMemberships(currentDate: Date) {
    this.logger.log("Running scheduled task to deactivate expired memberships");
    try {
      await this.db
        .update(membership)
        .set({
          isActive: false,
        })
        .where(and(eq(membership.isActive, true), lt(membership.end_date, currentDate)));

      this.logger.log(`Deactivated expired memberships`);
    } catch (error) {
      this.logger.error("Failed to deactivate expired memberships", error.stack);
    }
  }
}
