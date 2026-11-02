import type { DeliveryMethodConfigResponseDto } from "@biasmarket/types";

export interface CheckoutQueryState<T> {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
}

export interface CheckoutViewStateInput {
  deliveryQuery: CheckoutQueryState<DeliveryMethodConfigResponseDto[]>;
  pickupQuery: CheckoutQueryState<unknown>;
  paymentQuery: CheckoutQueryState<unknown>;
  courierQuery: CheckoutQueryState<unknown>;
}

export type CheckoutConfigError = "delivery" | "payment" | "pickup" | "courier";

export interface CheckoutViewState {
  isLoading: boolean;
  configError: CheckoutConfigError | null;
}

const queryFailed = ({ isError, data }: CheckoutQueryState<unknown>) =>
  isError && data === undefined;

export function checkoutViewState({
  deliveryQuery,
  pickupQuery,
  paymentQuery,
  courierQuery,
}: CheckoutViewStateInput): CheckoutViewState {
  const pickupEnabled = deliveryQuery.data?.some(
    ({ type }) => type === "PICKUP",
  );
  const courierEnabled = deliveryQuery.data?.some(
    ({ type }) => type === "COURIER",
  );

  const configError: CheckoutConfigError | null = queryFailed(deliveryQuery)
    ? "delivery"
    : queryFailed(paymentQuery)
      ? "payment"
      : pickupEnabled && queryFailed(pickupQuery)
        ? "pickup"
        : courierEnabled && queryFailed(courierQuery)
          ? "courier"
          : null;

  return {
    isLoading:
      deliveryQuery.isPending ||
      paymentQuery.isPending ||
      (pickupEnabled === true && pickupQuery.isPending) ||
      (courierEnabled === true && courierQuery.isPending),
    configError,
  };
}
