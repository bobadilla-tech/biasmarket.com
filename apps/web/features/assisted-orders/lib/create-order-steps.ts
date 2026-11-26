// Mobile create-order is three steps. Desktop ignores this and shows both
// columns at once. "+ Agregar" only adds a product; the seller opens the
// summary with an explicit button so several products can be added first.
export const CREATE_ORDER_STEPS = ["products", "summary", "details"] as const;

export type CreateOrderStep = (typeof CREATE_ORDER_STEPS)[number];

export function nextCreateOrderStep(
  step: CreateOrderStep,
): CreateOrderStep | null {
  const index = CREATE_ORDER_STEPS.indexOf(step);
  return CREATE_ORDER_STEPS[index + 1] ?? null;
}

export function previousCreateOrderStep(
  step: CreateOrderStep,
): CreateOrderStep | null {
  const index = CREATE_ORDER_STEPS.indexOf(step);
  return index > 0 ? (CREATE_ORDER_STEPS[index - 1] ?? null) : null;
}

// The summary step can be opened to see the empty state, but continuing to
// buyer / delivery / payment needs at least one product line.
export function canContinueFromSummary(productLineCount: number): boolean {
  return productLineCount > 0;
}
