import type { DeliveryMethodConfigResponseDto } from "@biasmarket/types";

export interface CheckoutQueryState<T> {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
}

export interface CheckoutViewStateInput {
  selectedDeliveryMethodType: string;
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
  selectedDeliveryMethodType,
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
      : pickupEnabled &&
          selectedDeliveryMethodType === "PICKUP" &&
          queryFailed(pickupQuery)
        ? "pickup"
        : courierEnabled &&
            selectedDeliveryMethodType === "COURIER" &&
            queryFailed(courierQuery)
          ? "courier"
          : null;

  return {
    isLoading:
      deliveryQuery.isPending ||
      paymentQuery.isPending ||
      (pickupEnabled === true &&
        selectedDeliveryMethodType === "PICKUP" &&
        pickupQuery.isPending) ||
      (courierEnabled === true &&
        selectedDeliveryMethodType === "COURIER" &&
        courierQuery.isPending),
    configError,
  };
}
