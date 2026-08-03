import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, Session } from "@thallesp/nestjs-better-auth";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { NotificationsService } from "./notifications.service.js";

function toBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === "true";
}

@Controller("stores/:storeId/notifications")
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  findAll(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
    @Query("archived") archived: string | undefined,
    @Query("read") read: string | undefined,
  ) {
    return this.notifications.findAllForStore(storeId, session.user.id, {
      archived: toBoolean(archived),
      read: toBoolean(read),
    });
  }

  @Get("unread-count")
  unreadCount(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
  ) {
    return this.notifications.unreadCount(storeId, session.user.id);
  }

  @Patch(":notificationId/read")
  markRead(
    @Param("storeId") storeId: string,
    @Param("notificationId") notificationId: string,
    @Session() session: UserSession,
  ) {
    return this.notifications.markRead(
      notificationId,
      storeId,
      session.user.id,
    );
  }

  @Post("read-all")
  markAllRead(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
  ) {
    return this.notifications.markAllRead(storeId, session.user.id);
  }

  @Patch(":notificationId/archive")
  archive(
    @Param("storeId") storeId: string,
    @Param("notificationId") notificationId: string,
    @Session() session: UserSession,
  ) {
    return this.notifications.archive(notificationId, storeId, session.user.id);
  }
}
