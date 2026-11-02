import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { MAX_PRODUCT_IMAGES } from "../product-images.constants.js";
import { CreateProductDto } from "./create-product.dto.js";
import { UpdateProductDto } from "./update-product.dto.js";
import { ReorderImagesDto } from "./reorder-images.dto.js";

const urls = (n: number) =>
  Array.from({ length: n }, (_, i) => `https://cdn.biasmarket.com/${i}.jpg`);

const validBase = { name: "Photocard", price: 10, currency: "PEN", stock: 1 };

const errorsFor = async <T extends object>(
  cls: new () => T,
  body: Record<string, unknown>,
) =>
  validate(plainToInstance(cls, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe("product image cap", () => {
  it("is six", () => {
    expect(MAX_PRODUCT_IMAGES).toBe(6);
  });

  describe.each([
    ["create", CreateProductDto, validBase],
    ["update", UpdateProductDto, {}],
  ] as const)("%s DTO", (_name, cls, base) => {
    it("accepts no images", async () => {
      expect(await errorsFor(cls, { ...base })).toEqual([]);
    });

    it("rejects image URLs supplied outside the owned upload flow", async () => {
      const errors = await errorsFor(cls, { ...base, images: urls(1) });
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe("images");
      expect(errors[0].constraints).toHaveProperty("whitelistValidation");
    });
  });

  it("reorder DTO rejects 7 images and accepts 6", async () => {
    expect(await errorsFor(ReorderImagesDto, { images: urls(6) })).toEqual([]);
    expect(
      (await errorsFor(ReorderImagesDto, { images: urls(7) }))[0]?.property,
    ).toBe("images");
  });

  it("accepts a boolean shipping flag and rejects other values", async () => {
    for (const [name, cls, base] of [
      ["create", CreateProductDto, validBase],
      ["update", UpdateProductDto, {}],
    ] as const) {
      expect(
        await errorsFor(cls, { ...base, shipsInternationally: false }),
      ).toEqual([]);
      const errors = await errorsFor(cls, {
        ...base,
        shipsInternationally: "false",
      });
      expect(
        errors.map(({ property }) => property),
        name,
      ).toContain("shipsInternationally");
    }
  });
});
