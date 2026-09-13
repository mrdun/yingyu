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

/* ------------------------------------------------------------------------------------------
 * O-02 批次: 用户 / 订单 / 会员 / Partner / 佣金 / 佣金规则 / 业务设置
 * 字段来源: apps/api/src/{admin,membership,partner,business-settings}/*
 * ------------------------------------------------------------------------------------------ */

/** GET /admin/users 单项 (教学概况来自 user_learn_record / user_learning_activities) */
export interface AdminUserRow {
  userId: string;
  username: string | null;
  createdAt: string | null;
  todayStatements: number;
  totalStatements: number;
  totalDurationSeconds: number;
}

/** GET /admin/users 响应 (总数在 Logto 响应头 total-number, 缺失时后端降级为当前页条数) */
export interface AdminUserList {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 订单状态 (唯一来源: apps/api/src/membership/types/order-status.ts)。
 * 前端只用于展示与过滤, 任何状态变更都以接口返回为准。
 */
export type OrderStatusValue =
  | "pending"
  | "processing"
  | "paid"
  | "refunding"
  | "failed"
  | "cancelled"
  | "expired"
  | "refunded";

/** GET /admin/dashboard/orders 单项 (列表行, 含 plan 名称与金额) */
export interface AdminOrderRow {
  orderId: string;
  userId: string;
  planName: string | null;
  amountFen: number;
  status: string;
  provider: string;
  createdAt: string | null;
  paidAt: string | null;
  refundedAt: string | null;
}

/** GET /admin/dashboard/orders 响应 */
export interface AdminOrderList {
  items: AdminOrderRow[];
  total: number;
  page: number;
  limit: number;
}

/**
 * GET /admin/orders/:id —— 订单详情 (orders 表投影)。
 * 只声明页面真正展示的字段: 不读取/不渲染 providerOrderId / providerTransactionId /
 * idempotencyKey 等渠道标识, 避免把第三方交易号带到浏览器上。
 */
export interface AdminOrderDetail {
  id: string;
  userId: string;
  planId: string;
  amountFen: number;
  currency: string;
  status: string;
  provider: string;
  paymentMethod: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** POST /admin/orders/:orderId/reconcile 返回 (后端 reconcileOrder 的摘要) */
export interface OrderReconcileResult {
  orderId?: string;
  action?: string;
  status?: string;
  recovered?: boolean;
  [key: string]: unknown;
}

/** POST /admin/orders/:orderId/refund 返回 (后端 refundOrder 的结果) */
export interface OrderRefundResult {
  orderId?: string;
  status?: string;
  refundedAt?: string | null;
  [key: string]: unknown;
}

/** GET /admin/dashboard/memberships 的日粒度会员增长点 */
export interface AdminMembershipGrowthPoint {
  date: string;
  newMembers: number;
  lifetimePurchases: number;
  paidUsers: number;
}

/** GET /admin/dashboard/memberships 响应 (会员增长, 按天聚合) */
export interface AdminMembershipGrowth {
  daily: AdminMembershipGrowthPoint[];
}

/** POST /admin/memberships/grant 返回 */
export interface MembershipGrantResult {
  userId: string;
  planId: string;
  startDate: string | null;
  endDate: string | null;
}

/**
 * Partner 状态 (唯一来源: apps/api/src/partner/partner-status.ts)。
 */
export type PartnerStatusValue = "pending" | "active" | "suspended" | "rejected";

/**
 * GET /admin/partners 单项。
 * 注意: 后端已剔除 partners.commission_rate(_bps) 旧字段, 佣金比例统一看 /admin/commission-rules。
 */
export interface AdminPartnerRow {
  id: string;
  userId: string;
  referralCode: string | null;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * 佣金状态 (唯一来源: apps/api/src/partner/commission-status.ts 与
 * commission_records.status 的 CHECK 约束)。
 */
export type CommissionStatusValue = "holding" | "pending" | "payable" | "paid" | "reversed";

/**
 * GET /admin/commissions 单项 (本批次新增接口)。
 * 金额/比例全部来自后端快照字段, 前端不做任何计算。
 */
export interface AdminCommissionRow {
  id: string;
  partnerUserId: string;
  partnerUsername: string | null;
  referredUserId: string;
  referredUsername: string | null;
  orderId: string;
  orderAmountFen: number;
  rateBps: number;
  commissionFen: number;
  status: string;
  holdUntil: string | null;
  createdAt: string | null;
  paidAt: string | null;
  updatedAt: string | null;
}

/** GET /admin/commissions 响应 */
export interface AdminCommissionList {
  items: AdminCommissionRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** POST /admin/commissions/confirm 返回 (退款保护期结束的 holding → pending 条数) */
export interface CommissionConfirmResult {
  confirmed: number;
}

/** 佣金规则状态 (后端 partner_commission_rules.status: active / inactive) */
export type CommissionRuleStatusValue = "active" | "inactive";

/** GET /admin/commission-rules 单项 (比例以整数 bps 存储) */
export interface AdminCommissionRule {
  id: string;
  partnerType: string;
  planId: string | null;
  rateBps: number;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** 佣金规则可写字段 (rateBps 只能是整数, 页面通过 parsePercentToBps 换算) */
export interface AdminCommissionRulePayload {
  partnerType?: string;
  planId?: string | null;
  rateBps?: number;
  status?: string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
}

/**
 * GET /admin/business-settings 单项。
 * 只包含业务参数 (value 以字符串存储); 系统级密钥/连接串不在该表中, 后台也不可编辑。
 */
export interface AdminBusinessSetting {
  key: string;
  value: string;
  updatedAt: string | null;
}

/** PATCH /admin/business-settings/:key 返回 (后端只回 key/value) */
export interface AdminBusinessSettingUpdate {
  key: string;
  value: string;
}

/** 服务端分页列表的统一投影 (users / orders / commissions 三种响应归一化后用同一套状态机) */
export interface ServerPage<T> {
  items: T[];
  total: number;
}
