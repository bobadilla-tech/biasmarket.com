import { getInfoAsync } from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import {
  MAX_FILE_SIZE,
  type ProofFileLike,
} from "@biasmarket/validation";

export async function compressPaymentProof(
  uri: string,
): Promise<ProofFileLike & { uri: string }> {
  for (const preset of [
    { width: 1600, compress: 0.75 },
    { width: 1200, compress: 0.65 },
    { width: 900, compress: 0.5 },
  ]) {
    const output = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: preset.width } }],
      { compress: preset.compress, format: ImageManipulator.SaveFormat.JPEG },
    );
    const info = await getInfoAsync(output.uri);
    if (
      info.exists &&
      typeof info.size === "number" &&
      info.size <= MAX_FILE_SIZE
    ) {
      return {
        uri: output.uri,
        name: `payment-proof-${Date.now()}.jpg`,
        type: "image/jpeg",
        size: info.size,
      };
    }
  }

  throw new Error("checkout.proofCompressFailed");
}

export function proofSelectionErrorKey(
  error: unknown,
): "checkout.proofCompressFailed" | "checkout.proofLoadFailed" {
  return error instanceof Error && error.message === "checkout.proofCompressFailed"
    ? "checkout.proofCompressFailed"
    : "checkout.proofLoadFailed";
}
