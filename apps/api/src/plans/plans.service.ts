import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";

import { membership, orders, planEntitlements, plans } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";

export interface PlanInput {
  name?: string;
  priceFen?: number;
  durationDays?: number | null;
  sortOrder?: number;
  isActive?: boolean;
  isPublic?: boolean;
}

export interface PlansHealth {
  ok: boolean;
  plansTotal: number;
  purchasablePlans: number;
  warnings: string[];
}

/**
 * 会员计划服务 (数据库驱动, 唯一价格来源)。管理员可配置, 无硬编码价格。
 */
@Injectable()
export class PlansService implements OnModuleInit {
  private readonly logger = new Logger(PlansService.name);

  constructor(@Inject(DB) private db: DbType) {}

  /**
   * 生产安全检查: plans 为空时商城无商品可卖, 必须显式告警而不是静默运行。
   * 只告警不阻断启动 (管理员可通过 /admin/plans 立即补数据)。
   */
  async onModuleInit() {
    try {
      const health = await this.getHealth();
      for (const warning of health.warnings) {
        this.logger.error(warning);
      }
    } catch (e) {
      this.logger.warn(`Plans startup health check skipped: ${(e as Error).message}`);
    }
  }

  /** 商业化健康检查: 计划是否可用 (供启动告警与 /admin/plans/health 使用) */
  async getHealth(): Promise<PlansHealth> {
    const all = await this.findAll();
    const purchasable = all.filter((plan) => plan.isActive && plan.isPublic);
    const warnings: string[] = [];

    if (all.length === 0) {
      warnings.push(
        "会员计划为空: 商城无可售商品。请执行 migration 0030 或通过 /admin/plans 创建会员方案。",
      );
    } else if (purchasable.length === 0) {
      warnings.push(
        "没有可售会员计划 (is_active=true 且 is_public=true): 用户在会员页无法购买, 请在 /admin/plans 上架方案。",
      );
    }

    return {
      ok: warnings.length === 0,
      plansTotal: all.length,
      purchasablePlans: purchasable.length,
      warnings,
    };
  }

  /** 管理端: 全部计划 */
  async findAll() {
    return await this.db.query.plans.findMany({
      orderBy: asc(plans.sortOrder),
    });
  }

  /** 公开方案页: active 且公开销售 */
  async findPublic() {
    return await this.db.query.plans.findMany({
      where: and(eq(plans.isActive, true), eq(plans.isPublic, true)),
      orderBy: asc(plans.sortOrder),
    });
  }

  async findById(planId: string) {
    return await this.db.query.plans.findFirst({
      where: eq(plans.id, planId),
    });
  }

  async getPlanEntitlements(planId: string) {
    return await this.db.query.planEntitlements.findMany({
      where: eq(planEntitlements.planId, planId),
    });
  }

  async createPlan(dto: PlanInput & { id: string; name: string; priceFen: number }) {
    if (!dto.id?.trim()) {
      throw new BadRequestException("plan id is required");
    }
    this.assertValid(dto);
    const existing = await this.findById(dto.id);
    if (existing) {
      throw new BadRequestException(`Plan ${dto.id} already exists`);
    }
    const [created] = await this.db
      .insert(plans)
      .values({
        id: dto.id.trim(),
        name: dto.name,
        priceFen: dto.priceFen,
        durationDays: dto.durationDays ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        isPublic: dto.isPublic ?? true,
      })
      .returning();
    return created;
  }

  async updatePlan(id: string, dto: PlanInput) {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Plan ${id} not found`);
    }
    this.assertValid(dto);

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.name !== undefined) set.name = dto.name;
    if (dto.priceFen !== undefined) set.priceFen = dto.priceFen;
    if (dto.durationDays !== undefined) set.durationDays = dto.durationDays;
    if (dto.sortOrder !== undefined) set.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) set.isActive = dto.isActive;
    if (dto.isPublic !== undefined) set.isPublic = dto.isPublic;

    const [updated] = await this.db.update(plans).set(set).where(eq(plans.id, id)).returning();
    return updated;
  }

  /**
   * 删除计划: 已产生订单/会员记录的计划不允许删除 (订单与会员均保留 plan_id 引用), 改为下架。
   * 避免直接触发外键错误 (500), 返回明确的 400 提示。
   */
  async deletePlan(id: string) {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Plan ${id} not found`);
    }
    const [order] = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.planId, id))
      .limit(1);
    if (order) {
      throw new BadRequestException(
        `Plan ${id} has orders; deactivate it (isActive=false) instead of deleting`,
      );
    }
    const [member] = await this.db
      .select({ id: membership.id })
      .from(membership)
      .where(eq(membership.planId, id))
      .limit(1);
    if (member) {
      throw new BadRequestException(
        `Plan ${id} is referenced by memberships; deactivate it (isActive=false) instead of deleting`,
      );
    }
    // 计划与其权益必须同事务删除: plan_entitlements.plan_id 有 FK, 单独删 plans 会留下脏数据/报错
    await this.db.transaction(async (tx) => {
      await tx.delete(planEntitlements).where(eq(planEntitlements.planId, id));
      await tx.delete(plans).where(eq(plans.id, id));
    });
    return { id, deleted: true };
  }

  private assertValid(dto: PlanInput) {
    if (dto.name !== undefined && !dto.name.trim()) {
      throw new BadRequestException("name must not be empty");
    }
    if (dto.priceFen !== undefined && (!Number.isInteger(dto.priceFen) || dto.priceFen <= 0)) {
      throw new BadRequestException("priceFen must be a positive integer");
    }
    if (
      dto.durationDays !== undefined &&
      dto.durationDays !== null &&
      (!Number.isInteger(dto.durationDays) || dto.durationDays < 1)
    ) {
      throw new BadRequestException("durationDays must be a positive integer or null");
    }
    if (dto.sortOrder !== undefined && (!Number.isInteger(dto.sortOrder) || dto.sortOrder < 0)) {
      throw new BadRequestException("sortOrder must be an integer >= 0");
    }
  }
}
