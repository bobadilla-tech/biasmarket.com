import { Test, TestingModule } from "@nestjs/testing";
import { type Mock, vi } from "vitest";

vi.mock("@thallesp/nestjs-better-auth", () => ({
  AuthGuard: class AuthGuard {},
  Roles: () => () => undefined,
  Session: () => () => undefined,
}));

import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

describe("UsersController", () => {
  let controller: UsersController;
  let users: { getStoreCounts: Mock };

  beforeEach(async () => {
    users = { getStoreCounts: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: users }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("getStoreCounts delegates to UsersService", async () => {
    users.getStoreCounts.mockResolvedValue([{
      userId: "user-1",
      storeCount: 2,
    }]);

    const result = await controller.getStoreCounts();

    expect(users.getStoreCounts).toHaveBeenCalled();
    expect(result).toEqual([{ userId: "user-1", storeCount: 2 }]);
  });
});
