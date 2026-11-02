import { expect, test } from "vitest";
import type { DeliveryMethodConfigResponseDto } from "@biasmarket/types";
import {
  checkoutViewState,
  type CheckoutViewStateInput,
} from "./checkout-view-state.js";

const query = <T>(
  data: T | undefined,
  overrides: Partial<{ isPending: boolean; isError: boolean }> = {},
) => ({
  data,
  isPending: overrides.isPending ?? false,
  isError: overrides.isError ?? false,
});
const delivery = (...types: Array<"PICKUP" | "COURIER">) =>
  types.map((type) => ({ type }) as DeliveryMethodConfigResponseDto);
const initial = (
  types: Array<"PICKUP" | "COURIER">,
  selectedDeliveryMethodType: string = "PICKUP",
): CheckoutViewStateInput => ({
  selectedDeliveryMethodType,
  deliveryQuery: query(delivery(...types)),
  pickupQuery: query({ points: [] }),
  paymentQuery: query([]),
  courierQuery: query([]),
});

test("shows retry state when delivery configuration fails", () => {
  const state = initial(["PICKUP"]);
  state.deliveryQuery = query(undefined, { isError: true });
  expect(checkoutViewState(state).configError).toBe("delivery");
});

test("a failed courier query does not block a pickup-only store", () => {
  const state = initial(["PICKUP"]);
  state.courierQuery = query(undefined, { isError: true });
  expect(checkoutViewState(state)).toEqual({
    isLoading: false,
    configError: null,
  });
});

test("shows retry state when an enabled courier query fails", () => {
  const state = initial(["PICKUP", "COURIER"], "COURIER");
  state.courierQuery = query(undefined, { isError: true });
  expect(checkoutViewState(state).configError).toBe("courier");
});

test("a failed courier query does not block pickup on a mixed-method store", () => {
  const state = initial(["PICKUP", "COURIER"], "PICKUP");
  state.courierQuery = query(undefined, { isError: true });
  expect(checkoutViewState(state)).toEqual({
    isLoading: false,
    configError: null,
  });
});

test("does not treat a refetch error with cached data as a configuration failure", () => {
  const state = initial(["PICKUP", "COURIER"]);
  state.courierQuery = query([], { isError: true });
  state.paymentQuery = query([], { isError: true });
  state.pickupQuery = query({ points: [] }, { isError: true });
  expect(checkoutViewState(state).configError).toBe(null);
});

test("includes an enabled pending courier query in the loading gate", () => {
  const state = initial(["COURIER"], "COURIER");
  state.courierQuery = query(undefined, { isPending: true });
  expect(checkoutViewState(state).isLoading).toBe(true);
});
