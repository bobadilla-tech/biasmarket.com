import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_FILE_SIZE } from "@biasmarket/validation";

const mocks = vi.hoisted(() => ({
  getInfoAsync: vi.fn(),
  manipulateAsync: vi.fn(),
  saveFormat: { JPEG: "jpeg" },
}));

vi.mock("expo-file-system/legacy", () => ({
  getInfoAsync: mocks.getInfoAsync,
}));
vi.mock("expo-image-manipulator", () => ({
  manipulateAsync: mocks.manipulateAsync,
  SaveFormat: mocks.saveFormat,
}));

import { compressPaymentProof } from "./proof-image";

afterEach(() => vi.clearAllMocks());

describe("compressPaymentProof", () => {
  it("keeps trying smaller JPEG presets until the result is below the upload limit", async () => {
    mocks.manipulateAsync
      .mockResolvedValueOnce({ uri: "file://large.jpg" })
      .mockResolvedValueOnce({ uri: "file://small.jpg" });
    mocks.getInfoAsync
      .mockResolvedValueOnce({ exists: true, size: MAX_FILE_SIZE + 1 })
      .mockResolvedValueOnce({ exists: true, size: MAX_FILE_SIZE - 1 });

    const result = await compressPaymentProof("file://camera-source.jpg");

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
  });

  it("fails with the localized key if every JPEG preset exceeds the upload limit", async () => {
    mocks.manipulateAsync.mockImplementation(async (_uri, _actions, options) => ({
      uri: `file://compressed-${String(options.compress)}.jpg`,
    }));
    mocks.getInfoAsync.mockResolvedValue({
      exists: true,
      size: MAX_FILE_SIZE + 1,
    });

    await expect(
      compressPaymentProof("file://camera-source.jpg"),
    ).rejects.toThrow("checkout.proofCompressFailed");
    expect(mocks.manipulateAsync).toHaveBeenCalledTimes(3);
  });
});
