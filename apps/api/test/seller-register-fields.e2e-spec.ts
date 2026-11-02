import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { AppModule } from "../src/app.module.js";

describe("seller register fields (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let cookie: string;

  const runId = randomUUID();
  const email = `seller-register-${runId}@example.com`;
  const password = "correcthorsebatterystaple";

  const sessionCookie = (res: request.Response): string | undefined => {
    const cookies = res.headers["set-cookie"] as unknown as
      string[] | undefined;
    return cookies
      ?.find((value) => value.includes("session_token="))
      ?.split(";")[0];
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    const signup = await request(app.getHttpServer())
      .post("/api/auth/sign-up/email")
      .send({
        email,
        password,
        name: "Register test",
        countryCode: "AR",
        uiRegister: "auto",
      })
      .expect(200);
    userId = signup.body.user.id;

    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
    const signIn = await request(app.getHttpServer())
      .post("/api/auth/sign-in/email")
      .send({ email, password })
      .expect(200);
    cookie = sessionCookie(signIn)!;
    if (!cookie) throw new Error("seller session cookie was not set");
  });

  afterAll(async () => {
    if (userId) {
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.account.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
  });

  it("accepts and stores countryCode and uiRegister at signup", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.countryCode).toBe("AR");
    expect(user.uiRegister).toBe("auto");
  });

  it("rejects invalid register values during signup", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/sign-up/email")
      .send({
        email: `rejected-register-${runId}@example.com`,
        password,
        name: "Rejected register test",
        uiRegister: "invalid",
        countryCode: "<script>",
      })
      .expect(400);
  });

  it("keeps role and plan server-controlled during signup", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/sign-up/email")
      .send({
        email: `rejected-admin-${runId}@example.com`,
        password,
        name: "Rejected admin test",
        role: "admin",
        plan: "premium",
      })
      .expect(400);
  });

  it("rejects invalid register values during update-user", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/update-user")
      .set("Cookie", cookie)
      .send({ uiRegister: "invalid", countryCode: "<script>" })
      .expect(400);
  });

  it("keeps role and plan server-controlled during update-user", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/update-user")
      .set("Cookie", cookie)
      .send({ role: "admin", plan: "premium" })
      .expect(400);
  });

  it("allows a seller to update their dashboard register", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/update-user")
      .set("Cookie", cookie)
      .send({ uiRegister: "voseo" })
      .expect(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.uiRegister).toBe("voseo");
  });

  it("does not update register preferences through an impersonated session", async () => {
    const session = await prisma.session.findFirstOrThrow({
      where: { userId },
    });
    await prisma.session.update({
      where: { id: session.id },
      data: { impersonatedBy: "admin-session" },
    });

    await request(app.getHttpServer())
      .post("/api/auth/update-user")
      .set("Cookie", cookie)
      .send({ uiRegister: "tuteo" })
      .expect(403);

    await prisma.session.update({
      where: { id: session.id },
      data: { impersonatedBy: null },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.uiRegister).toBe("voseo");
  });
});
