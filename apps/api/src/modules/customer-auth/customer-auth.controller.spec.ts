import { Test, type TestingModule } from "@nestjs/testing";
import { type Mock, vi } from "vitest";
import { CustomerAuthController } from "./customer-auth.controller.js";
import { CustomerAuthService } from "./customer-auth.service.js";
import { CustomerSessionGuard } from "./customer-session.guard.js";

// `AuthGuard`/`Session` are needed too, not just `Public` — this spec's
// controller imports `toOrderDto` from `order.controller.ts` (see
// docs/plans/2026-08-08-buyer-mini-dashboard-plan.md), which uses both at
// module-load time (`@UseGuards(AuthGuard)`, `@Session() session`).
vi.mock("@thallesp/nestjs-better-auth", () => ({
  Public: () => () => undefined,
  AuthGuard: class AuthGuard {},
  Session: () => () => undefined,
}));

vi.mock("@nestjs/throttler", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nestjs/throttler")>();
  return { ...actual, ThrottlerGuard: class ThrottlerGuard {} };
});

describe("CustomerAuthController", () => {
  let controller: CustomerAuthController;
  let service: {
    register: Mock;
    login: Mock;
    changePassword: Mock;
    getProfile: Mock;
    updateProfile: Mock;
    forgotPassword: Mock;
    getOrderDetail: Mock;
  };
  let res: { cookie: Mock; clearCookie: Mock };

  beforeEach(async () => {
    service = {
      register: vi.fn(),
      login: vi.fn(),
      changePassword: vi.fn(),
      getProfile: vi.fn(),
      updateProfile: vi.fn(),
      forgotPassword: vi.fn(),
      getOrderDetail: vi.fn(),
    };
    res = { cookie: vi.fn(), clearCookie: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerAuthController],
      providers: [{ provide: CustomerAuthService, useValue: service }],
    })
      .overrideGuard(CustomerSessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(CustomerAuthController);
  });

  it("register() delegates to the service with the token and password", async () => {
    service.register.mockResolvedValue({ ok: true });

    const result = await controller.register("my-store", {
      token: "tok",
      password: "super-secret-1",
    });

    expect(service.register).toHaveBeenCalledWith(
      "my-store",
      "tok",
      "super-secret-1",
    );
    expect(result).toEqual({ ok: true });
  });

  it("login() sets the session cookie on success", async () => {
    service.login.mockResolvedValue("signed-token");

    const result = await controller.login(
      "my-store",
      { phone: "+51988888888", password: "super-secret-1" },
      res as never,
    );

    expect(service.login).toHaveBeenCalledWith(
      "my-store",
      "+51988888888",
      "super-secret-1",
    );
    expect(res.cookie).toHaveBeenCalledWith(
      "bm_customer_session",
      "signed-token",
      expect.objectContaining({ httpOnly: true }),
    );
    expect(result).toEqual({ ok: true });
  });

  it("changePassword() reissues the session cookie with a fresh token", async () => {
    service.changePassword.mockResolvedValue("new-signed-token");
    const session = { buyerAccountId: "buyer-1" };

    const result = await controller.changePassword(
      session,
      { currentPassword: "old-1", newPassword: "new-1" },
      res as never,
    );

    expect(service.changePassword).toHaveBeenCalledWith(
      "buyer-1",
      "old-1",
      "new-1",
    );
    expect(res.cookie).toHaveBeenCalledWith(
      "bm_customer_session",
      "new-signed-token",
      expect.any(Object),
    );
    expect(result).toEqual({ ok: true });
  });

  it("me() delegates to the service with the slug and session", async () => {
    const session = { buyerAccountId: "buyer-1" };
    service.getProfile.mockResolvedValue({ customer: {}, orders: [] });

    const result = await controller.me("my-store", session);

    expect(service.getProfile).toHaveBeenCalledWith("my-store", session);
    expect(result).toEqual({ customer: {}, orders: [] });
  });

  it("updateMe() delegates to the service with the slug, session, and dto", async () => {
    const session = { buyerAccountId: "buyer-1" };
    service.updateProfile.mockResolvedValue({ name: "New Name" });
    const dto = { name: "New Name" };

    const result = await controller.updateMe("my-store", session, dto);

    expect(service.updateProfile).toHaveBeenCalledWith(
      "my-store",
      session,
      dto,
    );
    expect(result).toEqual({ name: "New Name" });
  });

  it("forgotPassword() delegates to the service with the slug and phone", async () => {
    const result = await controller.forgotPassword("my-store", {
      phone: "+51988888888",
    });

    expect(service.forgotPassword).toHaveBeenCalledWith(
      "my-store",
      "+51988888888",
    );
    expect(result).toEqual({ ok: true });
  });

  it("orderDetail() delegates to the service and maps the row through toOrderDto", async () => {
    const session = { buyerAccountId: "buyer-1" };
    const row = {
      id: "order-1",
      storeId: "store-1",
      customerId: null,
      customerEmail: null,
      customerPhone: "+51988888888",
      customerName: "Jane",
      deliveryMethodType: "PICKUP",
      deliveryDetails: null,
      pickupPointId: null,
      pickupDate: null,
      paymentMethod: null,
      paymentStatus: "PENDING_PAYMENT",
      paymentRejectionReason: null,
      fulfillmentStatus: "ORDERING",
      status: "ACTIVE",
      cancellationResolution: null,
      cancellationReason: null,
      retainedAmount: null,
      releasedAmount: null,
      releasedResolution: null,
      totalAmount: { toString: () => "100.00" },
      requiredAmount: { toString: () => "100.00" },
      currency: "PEN",
      expiresAt: new Date("2026-01-02"),
      createdAt: new Date("2026-01-01"),
      paidAmount: 0,
      pendingAmount: 100,
      paidPercentage: 0,
      items: [],
      payments: [],
    };
    service.getOrderDetail.mockResolvedValue(row);

    const result = await controller.orderDetail("my-store", "order-1", session);

    expect(service.getOrderDetail).toHaveBeenCalledWith(
      "my-store",
      session,
      "order-1",
    );
    expect(result).toEqual(expect.objectContaining({ id: "order-1" }));
  });

  it("logout() clears the session cookie", () => {
    const result = controller.logout(res as never);

    expect(res.clearCookie).toHaveBeenCalledWith(
      "bm_customer_session",
      expect.objectContaining({ path: "/" }),
    );
    expect(result).toEqual({ ok: true });
  });
});
