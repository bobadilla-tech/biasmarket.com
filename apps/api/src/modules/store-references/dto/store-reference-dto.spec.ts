import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreateStoreReferenceDto } from "./create-store-reference.dto.js";
import { UpdateStoreReferenceDto } from "./update-store-reference.dto.js";

describe("store reference boolean DTO fields", () => {
  it.each([
    [CreateStoreReferenceDto, { hidden: "tru" }, "hidden"],
    [CreateStoreReferenceDto, { privacyConfirmed: "" }, "privacyConfirmed"],
    [UpdateStoreReferenceDto, { hidden: "tru" }, "hidden"],
    [UpdateStoreReferenceDto, { privacyConfirmed: "" }, "privacyConfirmed"],
  ])("rejects malformed boolean input", async (Dto, input, property) => {
    const errors = await validate(plainToInstance(Dto, input));
    expect(errors.map((error) => error.property)).toContain(property);
  });

  it.each(["true", "false"])("accepts multipart boolean %s", async (value) => {
    for (const Dto of [CreateStoreReferenceDto, UpdateStoreReferenceDto]) {
      const dto = plainToInstance(Dto, {
        hidden: value,
        privacyConfirmed: value,
      });
      expect(dto.hidden).toBe(value === "true");
      expect(dto.privacyConfirmed).toBe(value === "true");
    }
  });
});
