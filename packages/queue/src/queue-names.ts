export const QUEUE_NAMES = {
  PING: "ping",
  MAILER: "mailer",
  ORDERS: "orders",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
