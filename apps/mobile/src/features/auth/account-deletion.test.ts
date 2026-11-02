import { describe, expect, it } from "vitest";
import { ApiError } from "@biasmarket/types";
import { isSessionEndedDeleteError } from "./account-deletion";

describe("isSessionEndedDeleteError", () => {
  it("recognizes an expired session response", () => {
    expect(isSessionEndedDeleteError(new ApiError("Unauthorized", 401))).toBe(
      true,
    );
  });

  it("keeps other errors on the ordinary delete-failed path", () => {
    expect(isSessionEndedDeleteError(new ApiError("Unavailable", 503))).toBe(
      false,
    );
    expect(isSessionEndedDeleteError(new Error("offline"))).toBe(false);
  });
});
