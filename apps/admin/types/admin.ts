/**
 * 管理端 API 契约类型。
 *
 * 刻意复制 (禁止 apps/admin import apps/client —— 那会把两个前端构建耦合在一起)。
 * 来源: apps/client/api/admin.ts 与 apps/api/src/{admin,plans,payment,health}/*.ts。
 * 后端字段增删请同步这里; 本批不改后端。
 */

/** GET /admin/overview —— 学习侧概览 */
export interface AdminOverview {
  userCount: number;
  activeToday: number;
  coursePackCount: number;
  statementCount: number;
  totalReviewRecords: number;
  todayLearnStatements: number;
}

/** GET /admin/dashboard/overview —— 收入/订单/会员/伙伴概览 (金额单位: 分) */
export interface DashboardOverview {
  revenue: {
    todayFen: number;
    yesterdayFen: number;
    monthFen: number;
    totalFen: number;
    refundFen: number;
    netRevenueFen: number;
  };
  orders: {
    todayCount: number;
    monthCount: number;
    paidCount: number;
    refundedCount: number;
    pendingCount: number;
  };
  memberships: {
    activeCount: number;
    lifetimeCount: number;
    newToday: number;
    newMonth: number;
  };
  partners: {
    activePartners: number;
    referralsToday: number;
    referralsMonth: number;
    commissionPendingFen: number;
    commissionTotalFen: number;
  };
}

/** GET /admin/plans 单项 */
export interface AdminPlanRow {
  id: string;
  name: string;
  priceFen: number;
  durationDays: number | null;
  sortOrder: number;
  isActive: boolean;
  isPublic: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/** 会员计划可写字段 (价格永远来自 API, 前端不硬编码任何价格) */
export interface AdminPlanPayload {
  id?: string;
  name?: string;
  priceFen?: number;
  durationDays?: number | null;
  sortOrder?: number;
  isActive?: boolean;
  isPublic?: boolean;
}

/** GET /admin/plans/health —— 商业化健康检查 */
export interface AdminPlansHealth {
  ok: boolean;
  plansTotal: number;
  purchasablePlans: number;
  warnings: string[];
}

/** 支付方式元信息 (后端 PAYMENT_METHOD_META) */
export interface PaymentChannelMethod {
  method: string;
  provider: string;
  label: string;
  qr: boolean;
}

/**
 * GET /admin/payment-channels 单项。
 * 后端只返回 enabled/configured 与支持方式, 不含任何商户密钥或证书内容。
 */
export interface AdminPaymentChannel {
  provider: string;
  enabled: boolean;
  configured: boolean;
  methods: PaymentChannelMethod[];
}

/** 单个依赖的健康状态 (GET /health 的 checks.*) */
export type DependencyState = "ok" | "fail" | "skipped";

/** GET /health 整体状态 */
export type HealthStatus = "ok" | "degraded" | "fail";

/**
 * GET /health 响应。
 * details 可能包含依赖报错文本, 页面不渲染它 (避免泄露连接串等内部信息)。
 */
export interface HealthReport {
  status: HealthStatus;
  version: string;
  env: string;
  checks: {
    database: DependencyState;
    redis: DependencyState;
    logto: DependencyState;
  };
  details?: Record<string, string>;
  timestamp: string;
}

/** 分页参数 (服务端分页接口使用) */
export interface PageParams {
  page?: number;
  pageSize?: number;
  limit?: number;
}

/** 通用分页响应 */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 当前登录管理员 (来自 Logto userinfo, 只读展示) */
export interface AdminIdentity {
  subject: string;
  username: string | null;
  email: string | null;
  name: string | null;
}
