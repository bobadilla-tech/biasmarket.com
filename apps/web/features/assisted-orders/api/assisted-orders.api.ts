import type {
  CreateAssistedOrderDto,
  CreateAssistedOrderResponseDto,
} from "@biasmarket/types";

function apiUrl() {
  return process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
}

export const IDEMPOTENT_REPLAY = "IDEMPOTENT_REPLAY";

// A retried create with the same `Idempotency-Key` answers 409 with
// `{ code: "IDEMPOTENT_REPLAY", orderId }`: the order already exists. The
// generated client's `customFetch` drops the error body, so this call reads it
// with a raw fetch (same precedent as `DuplicateOperationCodeError` in
// `features/orders/api/orders.api.ts`) and throws this typed error. The
// private link is not returned again; the seller opens the order and uses
// "regenerate link" if needed.
export class IdempotentReplayError extends Error {
  orderId: string;

  constructor(orderId: string) {
    super("order already created");
    this.name = "IdempotentReplayError";
    this.orderId = orderId;
  }
}

export const assistedOrdersApi = {
  async create(
    storeId: string,
    payload: CreateAssistedOrderDto,
    idempotencyKey: string,
  ): Promise<CreateAssistedOrderResponseDto> {
    const res = await fetch(
      `${apiUrl()}/api/stores/${encodeURIComponent(storeId)}/orders/assisted`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json().catch(() => null);
    if (
      res.status === 409 &&
      data?.code === IDEMPOTENT_REPLAY &&
      typeof data.orderId === "string"
    ) {
      throw new IdempotentReplayError(data.orderId);
    }
    if (!res.ok) {
      throw new Error(
        typeof data?.message === "string" ? data.message : "Network error",
      );
    }
    return data as CreateAssistedOrderResponseDto;
  },
};
