import { getRedisConnectionToken } from "@nestjs-modules/ioredis";
import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Redis } from "ioredis";
import * as request from "supertest";

import { plans } from "@earthworm/schema";
import { cleanDB, ensureUser, signin } from "../../../test/helper/utils";
import { AppModule } from "../../app/app.module";
import { appGlobalMiddleware } from "../../app/useGlobal";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";

describe("membership orders e2e", () => {
  let app: INestApplication;
  let db: DbType;
  let redis: Redis;
  let token: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    appGlobalMiddleware(app);
    db = moduleFixture.get<DbType>(DB);
    redis = moduleFixture.get<Redis>(getRedisConnectionToken());

    await app.init();
    await cleanDB(db);
    // cleanDB 会清空 plans, 因此这里必须自带会员方案 (e2e 不依赖 migration 0030 的 seed)
    await db
      .insert(plans)
      .values([{ id: "monthly", name: "月度会员", priceFen: 1800, durationDays: 30, sortOrder: 1 }])
      .onConflictDoNothing();
    token = await signin(moduleFixture);
    // users 影子表在生产由登录流程写入, e2e 不经过登录, 这里显式造出该用户 (订单/会员有 FK)
    await ensureUser(db, token);
  });

  afterEach(async () => {
    await redis.flushdb();
    await cleanDB(db);
    await endDB();
    await app.close();
  });

  it("POST /membership/orders 未登录应返回 401", async () => {
    await request(app.getHttpServer())
      .post("/membership/orders")
      .send({ planId: "monthly" })
      .expect(401);
  });

  it("GET /membership/status 未登录应返回 401", async () => {
    await request(app.getHttpServer()).get("/membership/status").expect(401);
  });

  it("POST /membership/orders 创建订单并返回 orderId + providerOrderId (mock 渠道)", async () => {
    const res = await request(app.getHttpServer())
      .post("/membership/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ planId: "monthly" })
      .expect(201);

    // 契约: orderId 是本地订单 id, providerOrderId 才是渠道单号 (以前这里断言 payUrl, 接口早已移除该字段)
    expect(res.body.orderId).toBeTruthy();
    expect(res.body.providerOrderId).toMatch(/^mock_/);
    expect(res.body.paymentMethod).toBe("mock");
    expect(res.body.amountFen).toBe(1800);
    expect(res.body.expiresAt).toBeTruthy();
  });

  it("POST /membership/orders 非法 planId 返回 400", async () => {
    await request(app.getHttpServer())
      .post("/membership/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ planId: "nope" })
      .expect(400);
  });

  it("GET /membership/orders/:orderId 返回 pending, mock-pay confirm 后未到期仍 pending(需 provider 判定)", async () => {
    const created = await request(app.getHttpServer())
      .post("/membership/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ planId: "monthly" })
      .expect(201);

    const orderId = created.body.orderId;
    // mock-pay 页面按渠道单号 (providerOrderId) 查订单, 不是本地 orderId
    const providerOrderId = created.body.providerOrderId;
    expect(providerOrderId).toMatch(/^mock_/);

    await request(app.getHttpServer())
      .get(`/membership/orders/${orderId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("pending");
      });

    // 模拟支付页无需鉴权
    await request(app.getHttpServer())
      .get(`/membership/mock-pay/${providerOrderId}?confirm=1`)
      .expect(200);

    const after = await request(app.getHttpServer())
      .get(`/membership/orders/${orderId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(after.body.status).toBe("paid");

    // 会员状态已开通
    await request(app.getHttpServer())
      .get("/membership/status")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.isMember).toBe(true);
        expect(body.endDate).toBeTruthy();
      });
  });

  it("GET /membership/my 返回当前用户会员状态", async () => {
    await request(app.getHttpServer())
      .get("/membership/my")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(expect.objectContaining({ isMember: expect.any(Boolean) }));
      });
  });
});
