import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module.js";

describe("stores sitemap endpoints (e2e)", () => {
  let app: INestApplication;
  const token = "stores-sitemap-e2e-token";

  beforeAll(async () => {
    process.env.SITEMAP_INTERNAL_TOKEN = token;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("preserves the legacy public array and serves sitemap envelopes", async () => {
    const legacy = await request(app.getHttpServer())
      .get("/stores/public")
      .expect(200);
    expect(Array.isArray(legacy.body)).toBe(true);

    const count = await request(app.getHttpServer())
      .get("/stores/internal/sitemap/count")
      .set("X-Internal-Sitemap-Token", token)
      .expect(200);
    expect(count.body).toEqual({ total: expect.any(Number) });

    const page = await request(app.getHttpServer())
      .get("/stores/internal/sitemap?limit=1&offset=0")
      .set("X-Internal-Sitemap-Token", token)
      .expect(200);
    expect(page.body).toEqual({
      items: expect.any(Array),
      total: count.body.total,
    });
    expect(page.body.items.length).toBeLessThanOrEqual(1);
  });

  it("rejects unauthenticated and invalid deep scans before querying", async () => {
    await request(app.getHttpServer())
      .get("/stores/internal/sitemap?limit=1&offset=0")
      .expect(401);
    await request(app.getHttpServer())
      .get("/stores/internal/sitemap?limit=50001&offset=0")
      .set("X-Internal-Sitemap-Token", token)
      .expect(400);
    await request(app.getHttpServer())
      .get("/stores/internal/sitemap?limit=1&offset=10000001")
      .set("X-Internal-Sitemap-Token", token)
      .expect(400);
  });
});
