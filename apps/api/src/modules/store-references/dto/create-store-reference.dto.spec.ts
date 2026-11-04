import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreateStoreReferenceDto } from "./create-store-reference.dto.js";

describe("CreateStoreReferenceDto hidden and privacy fields", () => {
  it("accepts the multipart string true", async () => {
    const dto = plainToInstance(CreateStoreReferenceDto, {
      takenAt: "2026-10-30T12:00:00.000Z",
      width: 100,
      height: 100,
      privacyConfirmed: "true",
    });

    expect(await validate(dto)).toEqual([]);
  });

  it("accepts a hidden draft without privacy confirmation", async () => {
    const dto = plainToInstance(CreateStoreReferenceDto, {
      takenAt: "2026-10-30T12:00:00.000Z",
      width: 100,
      height: 100,
      hidden: "true",
    });

    expect(dto.hidden).toBe(true);
    expect(await validate(dto)).toEqual([]);
  });

  it("preserves an omitted privacy confirmation so the controller can apply the hidden-state rule", async () => {
    const dto = plainToInstance(CreateStoreReferenceDto, {
      takenAt: "2026-10-30T12:00:00.000Z",
      width: 100,
      height: 100,
    });

    expect(dto.hidden).toBeUndefined();
    expect(dto.privacyConfirmed).toBeUndefined();
    expect(await validate(dto)).toEqual([]);
  });
});
