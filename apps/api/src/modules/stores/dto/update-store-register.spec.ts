import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateStoreDto } from "./update-store.dto.js";

describe("UpdateStoreDto register settings", () => {
  const errorsFor = (body: Record<string, unknown>) =>
    validate(plainToInstance(UpdateStoreDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it("accepts supported register settings and ISO country codes", async () => {
    expect(
      await errorsFor({ buyerRegister: "auto", countryCode: "AR" }),
    ).toEqual([]);
    expect(await errorsFor({ buyerRegister: "voseo" })).toEqual([]);
  });

  it.each([
    { buyerRegister: "usted" },
    { countryCode: "<script>" },
    { countryCode: "ar" },
  ])("rejects unsupported settings: %o", async (body) => {
    expect(await errorsFor(body)).not.toEqual([]);
  });
});
