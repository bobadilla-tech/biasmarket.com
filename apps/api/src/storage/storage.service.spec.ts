import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageService } from "./storage.service.js";

describe("StorageService.deleteImage", () => {
  const env = {
    S3_BUCKET: process.env.S3_BUCKET,
    S3_LOGO_BUCKET: process.env.S3_LOGO_BUCKET,
    S3_PAYMENT_BUCKET: process.env.S3_PAYMENT_BUCKET,
    S3_PUBLIC_URL: process.env.S3_PUBLIC_URL,
    S3_LEGACY_PUBLIC_URLS: process.env.S3_LEGACY_PUBLIC_URLS,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
    S3_SECRET_KEY: process.env.S3_SECRET_KEY,
  };
  let storage: StorageService;
  let send: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.S3_BUCKET = "public-assets";
    process.env.S3_LOGO_BUCKET = "store-logos";
    process.env.S3_PAYMENT_BUCKET = "private-payments";
    process.env.S3_PUBLIC_URL = "https://cdn.example.test/assets/";
    delete process.env.S3_LEGACY_PUBLIC_URLS;
    process.env.S3_ENDPOINT = "https://s3.example.test";
    process.env.S3_ACCESS_KEY = "test-access-key";
    process.env.S3_SECRET_KEY = "test-secret-key";
    storage = new StorageService();
    send = vi.fn().mockResolvedValue({});
    (storage as unknown as { client: { send: typeof send } }).client.send =
      send;
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it.each([
    ["public-assets", "store-references/ref.jpg"],
    ["store-logos", "logos/logo.png"],
    ["private-payments", "payments/proof.jpg"],
  ])(
    "deletes a URL under the configured %s bucket and prefix",
    async (bucket, key) => {
      await storage.deleteImage(
        `https://cdn.example.test/assets/${bucket}/${key}`,
      );

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteObjectCommand);
      expect(send.mock.calls[0]?.[0].input).toEqual({
        Bucket: bucket,
        Key: key,
      });
    },
  );

  it.each([
    "https://attacker.example.test/assets/public-assets/store-references/ref.jpg",
    "https://cdn.example.test/other/public-assets/store-references/ref.jpg",
    "https://cdn.example.test/assets/public-assets/untrusted/ref.jpg",
    "https://cdn.example.test/assets/unknown-bucket/store-references/ref.jpg",
    "https://cdn.example.test/assets/public-assets/store-references/ref.jpg?version=1",
    "https://cdn.example.test/assets/public-assets/products/../logos/logo.png",
  ])("rejects an untrusted deletion URL: %s", async (url) => {
    await expect(storage.deleteImage(url)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it("limits reference cleanup to reference objects within the public bucket", async () => {
    await storage.deleteStoreReferenceImage(
      "https://cdn.example.test/assets/public-assets/store-references/ref.jpg",
    );
    expect(send).toHaveBeenCalledOnce();
    send.mockClear();

    await expect(
      storage.deleteStoreReferenceImage(
        "https://cdn.example.test/assets/public-assets/products/product.jpg",
      ),
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it("deletes legacy image URLs only when their exact base is allowlisted", async () => {
    process.env.S3_LEGACY_PUBLIC_URLS =
      "https://old-cdn.example.test/previous-assets";
    storage = new StorageService();
    send = vi.fn().mockResolvedValue({});
    (storage as unknown as { client: { send: typeof send } }).client.send =
      send;

    await storage.deleteStoreReferenceImage(
      "https://old-cdn.example.test/previous-assets/public-assets/store-references/ref.jpg",
    );
    expect(send).toHaveBeenCalledOnce();

    await expect(
      storage.deleteStoreReferenceImage(
        "https://other-cdn.example.test/previous-assets/public-assets/store-references/ref.jpg",
      ),
    ).rejects.toThrow();
    expect(send).toHaveBeenCalledOnce();
  });

  it("strips leading slashes from legacy object paths", async () => {
    await storage.deleteStoreReferenceImage(
      "https://cdn.example.test/assets//public-assets/store-references/ref.jpg",
    );

    expect(send.mock.calls[0]?.[0].input).toEqual({
      Bucket: "public-assets",
      Key: "store-references/ref.jpg",
    });
  });

  it("matches the longest allowlisted URL base first", async () => {
    process.env.S3_PUBLIC_URL = "https://cdn.example.test";
    process.env.S3_LEGACY_PUBLIC_URLS = "https://cdn.example.test/old-assets";
    storage = new StorageService();
    send = vi.fn().mockResolvedValue({});
    (storage as unknown as { client: { send: typeof send } }).client.send =
      send;

    await storage.deleteStoreReferenceImage(
      "https://cdn.example.test/old-assets/public-assets/store-references/ref.jpg",
    );

    expect(send.mock.calls[0]?.[0].input).toEqual({
      Bucket: "public-assets",
      Key: "store-references/ref.jpg",
    });
  });

  it("merges allowed prefixes when public and logo uploads share a bucket", async () => {
    process.env.S3_LOGO_BUCKET = "public-assets";
    storage = new StorageService();
    send = vi.fn().mockResolvedValue({});
    (storage as unknown as { client: { send: typeof send } }).client.send =
      send;

    await storage.deleteImage(
      "https://cdn.example.test/assets/public-assets/logos/logo.png",
    );

    expect(send.mock.calls[0]?.[0].input).toEqual({
      Bucket: "public-assets",
      Key: "logos/logo.png",
    });
  });
});
