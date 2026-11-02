import { describe, expect, test } from "vitest";
import {
  isClosedRscPrefetchNoise,
  isObscuraBootstrapNoise,
} from "./sentry-noise";

describe("Sentry noise filters", () => {
  test("drops the aborted RSC prefetch message and preserves ordinary errors", () => {
    expect(
      isClosedRscPrefetchNoise({
        exception: {
          values: [{ value: "Error: The destination stream closed early." }],
        },
      }),
    ).toBe(true);
    expect(
      isClosedRscPrefetchNoise({ message: "Checkout request failed" }),
    ).toBe(false);
  });

  test("drops tracker bootstrap stacks and preserves ordinary browser errors", () => {
    expect(
      isObscuraBootstrapNoise({
        exception: {
          values: [
            {
              value: "Cannot read properties of undefined",
              stacktrace: {
                frames: [{ filename: "<obscura:bootstrap>" }],
              },
            },
          ],
        },
      }),
    ).toBe(true);
    expect(isObscuraBootstrapNoise({ message: "A real browser error" })).toBe(
      false,
    );
  });
});
