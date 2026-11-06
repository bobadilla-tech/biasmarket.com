export const QUEUE_NAMES = {
  PING: "ping",
  MAILER: "mailer",
  ORDERS: "orders",
  PAYMENT_PROOF_SWEEP: "payment-proof-sweep",
  PREMIUM: "premium",
  PUSH: "push",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
