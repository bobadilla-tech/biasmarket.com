import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_FILE_SIZE } from "@biasmarket/validation";

const mocks = vi.hoisted(() => ({
  getInfoAsync: vi.fn(),
  deleteAsync: vi.fn().mockResolvedValue(undefined),
  manipulateAsync: vi.fn(),
  saveFormat: { JPEG: "jpeg" },
}));

vi.mock("expo-file-system/legacy", () => ({
  getInfoAsync: mocks.getInfoAsync,
  deleteAsync: mocks.deleteAsync,
}));
vi.mock("expo-image-manipulator", () => ({
  manipulateAsync: mocks.manipulateAsync,
  SaveFormat: mocks.saveFormat,
}));

import { compressPaymentProof, proofSelectionErrorKey } from "./proof-image";

afterEach(() => vi.clearAllMocks());

describe("compressPaymentProof", () => {
  it("keeps trying smaller JPEG presets until the result is below the upload limit", async () => {
    mocks.manipulateAsync
      .mockResolvedValueOnce({ uri: "file://large.jpg" })
      .mockResolvedValueOnce({ uri: "file://small.jpg" });
    mocks.getInfoAsync
      .mockResolvedValueOnce({ exists: true, size: MAX_FILE_SIZE + 1 })
      .mockResolvedValueOnce({ exists: true, size: MAX_FILE_SIZE - 1 });

    const result = await compressPaymentProof("file://camera-source.jpg", 2400);

    expect(result).toMatchObject({
      uri: "file://small.jpg",
      type: "image/jpeg",
      size: MAX_FILE_SIZE - 1,
    });
    expect(mocks.manipulateAsync).toHaveBeenCalledTimes(2);
    expect(mocks.manipulateAsync).toHaveBeenNthCalledWith(
      1,
      "file://camera-source.jpg",
      [{ resize: { width: 1600 } }],
      { compress: 0.75, format: "jpeg" },
    );
    expect(mocks.manipulateAsync).toHaveBeenNthCalledWith(
      2,
      "file://camera-source.jpg",
      [{ resize: { width: 1200 } }],
      { compress: 0.65, format: "jpeg" },
    );
    expect(mocks.deleteAsync).toHaveBeenCalledWith("file://large.jpg", {
      idempotent: true,
    });
  });

  it("fails with the localized key if every JPEG preset exceeds the upload limit", async () => {
    mocks.manipulateAsync.mockImplementation(
      async (_uri, _actions, options) => ({
        uri: `file://compressed-${String(options.compress)}.jpg`,
      }),
    );
    mocks.getInfoAsync.mockResolvedValue({
      exists: true,
      size: MAX_FILE_SIZE + 1,
    });

    await expect(
      compressPaymentProof("file://camera-source.jpg", 2400),
    ).rejects.toThrow("checkout.proofCompressFailed");
    expect(mocks.manipulateAsync).toHaveBeenCalledTimes(3);
    expect(mocks.deleteAsync).toHaveBeenCalledTimes(3);
  });

  it("accepts a proof exactly at the upload limit", async () => {
    mocks.manipulateAsync.mockResolvedValueOnce({ uri: "file://exact.jpg" });
    mocks.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      size: MAX_FILE_SIZE,
    });

    const result = await compressPaymentProof("file://source.jpg", 2400);

    expect(result.size).toBe(MAX_FILE_SIZE);
    expect(mocks.deleteAsync).not.toHaveBeenCalled();
  });

  it("falls through missing metadata and deletes intermediate outputs", async () => {
    mocks.manipulateAsync
      .mockResolvedValueOnce({ uri: "file://missing.jpg" })
      .mockResolvedValueOnce({ uri: "file://unknown-size.jpg" })
      .mockResolvedValueOnce({ uri: "file://third-preset.jpg" });
    mocks.getInfoAsync
      .mockResolvedValueOnce({ exists: false, size: 200 })
      .mockResolvedValueOnce({ exists: true })
      .mockResolvedValueOnce({ exists: true, size: 200 });

    const result = await compressPaymentProof("file://source.jpg", 2400);

    expect(result.uri).toBe("file://third-preset.jpg");
    expect(mocks.manipulateAsync).toHaveBeenNthCalledWith(
      3,
      "file://source.jpg",
      [{ resize: { width: 900 } }],
      { compress: 0.5, format: "jpeg" },
    );
    expect(mocks.deleteAsync).toHaveBeenNthCalledWith(1, "file://missing.jpg", {
      idempotent: true,
    });
    expect(mocks.deleteAsync).toHaveBeenNthCalledWith(
      2,
      "file://unknown-size.jpg",
      { idempotent: true },
    );
  });

  it("does not upscale a proof narrower than the first preset", async () => {
    mocks.manipulateAsync.mockResolvedValueOnce({ uri: "file://small.jpg" });
    mocks.getInfoAsync.mockResolvedValueOnce({ exists: true, size: 200 });

    await compressPaymentProof("file://small-source.jpg", 640);

    expect(mocks.manipulateAsync).toHaveBeenCalledWith(
      "file://small-source.jpg",
      [],
      { compress: 0.75, format: "jpeg" },
    );
  });

  it("maps native errors to catalog keys instead of displaying platform text", () => {
    expect(
      proofSelectionErrorKey(new Error("checkout.proofCompressFailed")),
    ).toBe("checkout.proofCompressFailed");
    expect(proofSelectionErrorKey(new Error("native platform error"))).toBe(
      "checkout.proofLoadFailed",
    );
    expect(proofSelectionErrorKey("native platform error")).toBe(
      "checkout.proofLoadFailed",
    );
  });
});
