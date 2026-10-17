import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { PublicOrderResponseDto } from "@biasmarket/types";
import { installLocalStorage } from "../../../test-utils/local-storage";
import { inviteStorage } from "../lib/invite-storage";

const { recordInvite } = vi.hoisted(() => ({ recordInvite: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  apiClient: { publicOrders: { recordInvite } },
}));

const { useSaveInvite } = await import("./use-save-invite");

const order = {
  orderNumber: "BM-1",
  status: "ACTIVE",
  paymentStatus: "VERIFIED",
  fulfillmentStatus: "ORDERING",
  hasValidatedPayment: true,
  claimed: false,
  receiptConfirmedAt: null,
} as unknown as PublicOrderResponseDto;

beforeEach(() => {
  installLocalStorage();
  inviteStorage.clearMemory();
  recordInvite.mockResolvedValue(undefined);
});
afterEach(() => vi.resetAllMocks());

// The reporting effect re-runs when one of its dependencies changes while the
// moment stays the same; the ref guard is what keeps that to a single event.
test("INVITE_SHOWN is reported once per moment even when the effect re-runs", async () => {
  const { rerender } = renderHook(
    ({ slug }) =>
      useSaveInvite({
        slug,
        token: "tok",
        order,
        receiptJustConfirmed: false,
      }),
    { initialProps: { slug: "a" } },
  );
  await waitFor(() => expect(recordInvite).toHaveBeenCalledTimes(1));

  rerender({ slug: "b" });
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(recordInvite).toHaveBeenCalledTimes(1);
});
