/**
 * 管理端 API 契约类型。
 *
 * 刻意复制 (禁止 apps/admin import apps/client —— 那会把两个前端构建耦合在一起)。
 * 来源: apps/api/src/{admin,plans,payment,health}/*.ts 的返回类型。
 * (用户端的旧后台页面与配套 API 客户端已在 O-04 批次整体删除, 管理端契约只跟后端对齐。)
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

/* ------------------------------------------------------------------------------------------
 * O-03 批次: 课程中心 (课程包 / 课程 / 语句 / AI 生成)
 * 字段来源: apps/api/src/admin/admin.service.ts、apps/api/src/ai-content/*、
 *           packages/schema/src/schema/{coursePack,course,statement}.ts
 * ------------------------------------------------------------------------------------------ */

/** 课程包状态 (唯一来源: apps/api/src/course-pack/course-status.ts) */
export type CoursePackStatusValue = "draft" | "review" | "published" | "archived";
/** 内容来源 (人工创建 / AI 生成; schema 还允许 subtitle/audio/import) */
export type CoursePackSourceValue = "manual" | "ai";
/** 访问级别: 免费 / 会员 */
export type CourseAccessLevelValue = "free" | "membership";
/** 语句素材类型 */
export type StatementSourceTypeValue = "text" | "audio" | "video";

/** GET /admin/course-packs 单项 */
export interface AdminCoursePackRow {
  id: string;
  title: string;
  isFree: boolean;
  status: string;
  source: string;
  accessLevel: string;
  courseCount: number;
  statementCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * GET /admin/course-packs 响应。
 * 注意字段名是 coursePacks (不是 items), 与 orders/commissions 的 items 不同 —— 页面通过
 * services/courses.service.ts 归一化成 ServerPage。
 */
export interface AdminCoursePackList {
  coursePacks: AdminCoursePackRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** GET /admin/course-packs/:id 里的课程行 (只含元数据与语句数量, 不含语句正文) */
export interface AdminCourseRow {
  id: string;
  title: string;
  description: string;
  video: string;
  order: number;
  statementCount: number;
  createdAt: string;
  updatedAt: string;
}

/** GET /admin/course-packs/:id —— 课程包详情 (不限状态) */
export interface AdminCoursePackDetail {
  id: string;
  title: string;
  description: string;
  cover: string | null;
  status: string;
  source: string;
  accessLevel: string;
  isFree: boolean;
  order: number;
  shareLevel: string;
  createdAt: string;
  updatedAt: string;
  courses: AdminCourseRow[];
}

/** GET /admin/courses/:courseId/statements 单项 */
export interface AdminStatementRow {
  id: string;
  chinese: string;
  english: string;
  soundmark: string;
  sourceType: string;
  audioUrl: string | null;
  startMs: number | null;
  endMs: number | null;
  order: number;
}

/** GET /admin/courses/:courseId/statements 响应 */
export interface AdminStatementList {
  items: AdminStatementRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 课程包可写字段 (POST /admin/course-packs、PATCH /admin/course-packs/:id 的 DTO)。
 * order 走 PATCH (`@IsOptional @IsInt @Min(0)`), 与课程/语句排序一样是同一条单条 PATCH;
 * accessLevel 另有独立端点, status 只能走状态机 —— 三者不要混进同一个请求里。
 */
export interface AdminCoursePackWritePayload {
  title?: string;
  description?: string;
  cover?: string;
  /** 排序 (PATCH /admin/course-packs/:id 接受 order: @IsOptional @IsInt @Min(0)) */
  order?: number;
  accessLevel?: CourseAccessLevelValue;
}

/** 课程可写字段 (POST .../courses、PATCH /admin/courses/:courseId) —— order 由后端 DTO 接受 */
export interface AdminCourseWritePayload {
  title?: string;
  description?: string;
  video?: string;
  order?: number;
}

/** 语句可写字段 (POST .../statements、PATCH /admin/statements/:statementId) */
export interface AdminStatementWritePayload {
  chinese?: string;
  english?: string;
  soundmark?: string;
  sourceType?: string;
  audioUrl?: string;
  startMs?: number;
  endMs?: number;
  order?: number;
}

/** POST /ai-content/split 单项 (只预览, 不落库) */
export interface AiSplitStatement {
  chinese: string;
  english: string;
  soundmark: string;
  order: number;
}

/** POST /ai-content/{course-pack,subtitle,audio} 的返回 (后端事务内已写入 draft + source=ai) */
export interface AiCoursePackResult {
  coursePackId: string;
  courseCount: number;
}

/* ------------------------------------------------------------------------------------------
 * O-04 批次: 学习路线 (把课程包编排成有顺序的学习路径: 阶段 → 课程包)
 * 字段来源: apps/api/src/admin/learning-paths.{controller,service}.ts、
 *           packages/schema/src/schema/learningPath.ts
 * ------------------------------------------------------------------------------------------ */

/**
 * GET /admin/learning-paths 单项。
 * 管理端返回**全部**路线 (含未发布); isPublished 只用于展示与过滤,
 * 公开接口 (GET /learning-path) 仍然只暴露 isPublished=true 的路线。
 */
export interface AdminLearningPathRow {
  id: string;
  title: string;
  description: string;
  cover: string | null;
  order: number;
  isPublished: boolean;
  /** 该路线下的条目数 (列表页直接展示) */
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

/** GET /admin/learning-paths 响应 */
export interface AdminLearningPathList {
  items: AdminLearningPathRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** 路线条目 (阶段 → 课程包), coursePackTitle 由后端 join 出来 */
export interface AdminLearningPathItemRow {
  id: string;
  stage: string;
  coursePackId: string;
  coursePackTitle: string;
  order: number;
}

/** GET /admin/learning-paths/:id —— 详情 + 条目列表 (按 asc(order), asc(id)) */
export interface AdminLearningPathDetail extends AdminLearningPathRow {
  items: AdminLearningPathItemRow[];
}

/**
 * 路线可写字段 (POST /admin/learning-paths、PATCH /admin/learning-paths/:id)。
 * order 与课程包/课程/语句排序同一套规则 (@IsOptional @IsInt @Min(0));
 * 发布状态**不在这里**改 —— 只能走 PATCH /admin/learning-paths/:id/publish。
 */
export interface AdminLearningPathWritePayload {
  title?: string;
  description?: string;
  cover?: string;
  order?: number;
}

/** 条目可写字段 (POST .../items、PATCH /admin/learning-path-items/:itemId) */
export interface AdminLearningPathItemWritePayload {
  coursePackId?: string;
  stage?: string;
  order?: number;
}

/**
 * 条目编排用的课程包下拉项。
 * 数据来自既有课程包列表接口 (GET /admin/course-packs), 本批次没有新增课程包接口。
 */
export interface CoursePackOption {
  id: string;
  title: string;
  /** draft / review / published / archived —— 仅用于在下拉里标注, 不做过滤 */
  status: string;
}
