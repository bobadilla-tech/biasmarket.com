import type {
  NotificationCountResponseDto,
  NotificationResponseDto,
} from "@biasmarket/types";

// Response shapes come from the generated OpenAPI client now (see
// lib/api-client.ts) — plain type aliases, not zod schemas. apps/api's
// NotificationsController + response DTOs are the runtime guarantee for
// these pass-through reads. See "OpenAPI note" in apps/web/AGENTS.md.
export type NotificationItem = NotificationResponseDto;
export type UnreadCount = NotificationCountResponseDto;
