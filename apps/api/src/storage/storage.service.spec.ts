import { vi } from "vitest";

vi.mock("../config/env.validation.js", () => ({
  requiredEnv: (name: string) =>
    ({
      S3_BUCKET: "public",
      S3_LOGO_BUCKET: "logos",
      S3_PAYMENT_BUCKET: "payments",
      S3_PUBLIC_URL: "https://cdn.example.com/files",
      S3_ENDPOINT: "http://minio:9000",
      S3_ACCESS_KEY: "key",
      S3_SECRET_KEY: "secret",
    })[name] ?? "",
}));

import { StorageService } from "./storage.service.js";

describe("StorageService.deleteImage", () => {
  let service: StorageService;
  let send: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new StorageService();
    send = vi.fn().mockResolvedValue({});
    (service as unknown as { client: { send: unknown } }).client = { send };
  });

  it.each(["public", "logos", "payments"])(
    "deletes objects from the %s bucket under a public URL path prefix",
    async (bucket) => {
      await service.deleteImage(
        `https://cdn.example.com/files/${bucket}/a/b%20c.png`,
      );

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]![0].input).toEqual({
        Bucket: bucket,
        Key: "a/b c.png",
      });
    },
  );

  it("ignores query strings and fragments", async () => {
    await service.deleteImage("https://cdn.example.com/files/public/a.png?v=1#x");
    expect(send.mock.calls[0]![0].input).toEqual({
      Bucket: "public",
      Key: "a.png",
    });
  });

  it("rejects URLs outside the configured public URL or buckets", async () => {
    await expect(
      service.deleteImage("https://evil.example.com/files/public/a.png"),
    ).rejects.toThrow("Unsupported storage object URL");
    await expect(
      service.deleteImage("https://cdn.example.com/files/other/a.png"),
    ).rejects.toThrow("Unsupported storage object URL");
    await expect(
      service.deleteImage("https://cdn.example.com/files/public/"),
    ).rejects.toThrow("Unsupported storage object URL");
    expect(send).not.toHaveBeenCalled();
  });
});
