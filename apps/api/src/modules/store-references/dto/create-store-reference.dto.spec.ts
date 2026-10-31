import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreateStoreReferenceDto } from "./create-store-reference.dto.js";

describe("CreateStoreReferenceDto privacy confirmation", () => {
  it("accepts the multipart string true", async () => {
    const dto = plainToInstance(CreateStoreReferenceDto, {
      takenAt: "2026-10-30T12:00:00.000Z",
      width: 100,
      height: 100,
      privacyConfirmed: "true",
    });

    expect(await validate(dto)).toEqual([]);
  });

  it.each(["false", false, undefined])("rejects %s", async (value) => {
    const dto = plainToInstance(CreateStoreReferenceDto, {
      takenAt: "2026-10-30T12:00:00.000Z",
      width: 100,
      height: 100,
      privacyConfirmed: value,
    });

    expect(await validate(dto)).not.toEqual([]);
  });
});
