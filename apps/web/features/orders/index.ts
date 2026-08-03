export { ordersApi } from "./api/orders.api";

export { ordersKeys, useOrders } from "./queries/use-orders";
export {
  enabledPaymentMethodsKeys,
  useEnabledPaymentMethods,
} from "./queries/use-enabled-payment-methods";

export { useReviewPayment } from "./mutations/use-review-payment";
export { useAdvanceFulfillment } from "./mutations/use-advance-fulfillment";
export { useRegisterPayment } from "./mutations/use-register-payment";
export { useOptimisticStatusChange } from "./mutations/use-optimistic-status-change";

export {
  getOrderStatus,
  matchesTab,
  NEXT_FULFILLMENT,
  type OrdersTab,
  SENSITIVE_FULFILLMENT,
} from "./lib/order-status";
export {
  formatOrderDate,
  getDeliveryLabel,
  getInitials,
  getOrderNumber,
  getProductSummary,
} from "./lib/order-format";

export { OrdersTabs } from "./components/orders-tabs";
export { OrdersTable } from "./components/orders-table";
export { OrderStatusBadge } from "./components/order-status-badge";
export { OrderDetailSheet } from "./components/order-detail-sheet";
export { RegisterPaymentForm } from "./components/register-payment-form";
export { PaymentHistoryList } from "./components/payment-history-list";
export { PaymentProofLightbox } from "./components/payment-proof-lightbox";
export { ConfirmTransitionDialog } from "./components/confirm-transition-dialog";

export {
  type Order,
  type OrderItemRow,
  orderItemRowSchema,
  orderListSchema,
  type OrderPaymentRow,
  orderPaymentRowSchema,
  orderSchema,
} from "./schemas/order.schema";
export {
  buildRegisterPaymentSchema,
  PAYMENT_METHOD_TYPES,
  type RegisterPaymentInput,
} from "./schemas/register-payment.schema";
