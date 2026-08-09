import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiQuery } from "@nestjs/swagger";
import { AuthGuard, Session } from "@thallesp/nestjs-better-auth";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { NotificationsService } from "./notifications.service.js";
import type {
  NotificationCountResponseDto,
  NotificationResponseDto,
} from "./dto/notification-response.dto.js";

function toBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === "true";
}

interface NotificationRow {
  id: string;
  storeId: string;
  type: "LOW_STOCK" | "OUT_OF_STOCK" | "PAYMENT_PROOF_SUBMITTED";
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  metadata: unknown;
  read: boolean;
  readAt: Date | null;
  archived: boolean;
  archivedAt: Date | null;
  createdAt: Date;
}

function toNotificationDto(
  notification: NotificationRow,
): NotificationResponseDto {
  return {
    ...notification,
    metadata: notification.metadata as Record<string, unknown>,
    readAt: notification.readAt?.toISOString() ?? null,
    archivedAt: notification.archivedAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

@Controller("stores/:storeId/notifications")
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @ApiQuery({ name: "archived", required: false, type: String })
  @ApiQuery({ name: "read", required: false, type: String })
  @Get()
  async findAll(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
    @Query("archived") archived: string | undefined,
    @Query("read") read: string | undefined,
  ): Promise<NotificationResponseDto[]> {
    const notifications = await this.notifications.findAllForStore(
      storeId,
      session.user.id,
      { archived: toBoolean(archived), read: toBoolean(read) },
    );
    return notifications.map(toNotificationDto);
  }

  @Get("unread-count")
  unreadCount(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
  ): Promise<NotificationCountResponseDto> {
    return this.notifications.unreadCount(storeId, session.user.id);
  }

  @Patch(":notificationId/read")
  async markRead(
    @Param("storeId") storeId: string,
    @Param("notificationId") notificationId: string,
    @Session() session: UserSession,
  ): Promise<NotificationResponseDto> {
    const notification = await this.notifications.markRead(
      notificationId,
      storeId,
      session.user.id,
    );
    return toNotificationDto(notification);
  }

  @Post("read-all")
  markAllRead(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
  ): Promise<NotificationCountResponseDto> {
    return this.notifications.markAllRead(storeId, session.user.id);
  }

  @Patch(":notificationId/archive")
  async archive(
    @Param("storeId") storeId: string,
    @Param("notificationId") notificationId: string,
    @Session() session: UserSession,
  ): Promise<NotificationResponseDto> {
    const notification = await this.notifications.archive(
      notificationId,
      storeId,
      session.user.id,
    );
    return toNotificationDto(notification);
  }
}
