import { getRedisConnectionToken } from "@nestjs-modules/ioredis";
import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Redis } from "ioredis";
import * as request from "supertest";

import { plans } from "@earthworm/schema";
import { cleanDB, signin } from "../../../test/helper/utils";
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

  it("POST /membership/orders 创建订单并返回 orderId + payUrl", async () => {
    const res = await request(app.getHttpServer())
      .post("/membership/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ planId: "monthly" })
      .expect(201);

    expect(res.body.orderId).toContain("mock_");
    expect(res.body.payUrl).toContain("/membership/mock-pay/");
    expect(res.body.amountFen).toBe(1800);
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

    await request(app.getHttpServer())
      .get(`/membership/orders/${orderId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("pending");
      });

    // 模拟支付页无需鉴权
    await request(app.getHttpServer()).get(`/membership/mock-pay/${orderId}?confirm=1`).expect(200);

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
