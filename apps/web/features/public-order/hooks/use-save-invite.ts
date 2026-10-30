"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicOrderResponseDto } from "@biasmarket/types";
import { apiClient } from "@/lib/api-client";
import type { InviteMoment } from "../lib/invite-config";
import { inviteStorage } from "../lib/invite-storage";
import { isInviteEligible, pickInviteMoment } from "../lib/invite-rules";

type EventType = "INVITE_SHOWN" | "INVITE_CLICKED" | "INVITE_DISMISSED";

// Fire and forget: an analytics beacon must never break or delay the page.
// `keepalive` lets a click event survive the navigation to Google that
// follows it.
function sendInviteEvent(
  token: string,
  type: EventType,
  moment: InviteMoment,
): void {
  void Promise.resolve()
    .then(() =>
      apiClient.publicOrders.recordInvite(
        token,
        { type, moment },
        { keepalive: true },
      ),
    )
    .catch(() => undefined);
}

/**
 * Decides which (at most one) "save this order" invitation the page shows,
 * reads/writes the per-browser memory, and reports SHOWN / CLICKED /
 * DISMISSED with the moment. Browser state is read in an effect, so the first
 * render shows nothing and there is no hydration mismatch.
 */
export function useSaveInvite({
  slug,
  token,
  order,
  receiptJustConfirmed,
}: {
  slug: string;
  token: string;
  order: PublicOrderResponseDto;
  receiptJustConfirmed: boolean;
}) {
  const orderNumber = order.orderNumber ?? "";
  const [memory, setMemory] = useState<{
    firstSeen: boolean;
    dismissedAt: number | null;
  } | null>(null);
  // Session-only hide of the delivery block (it ignores the banner dismissal).
  const [entregaHidden, setEntregaHidden] = useState(false);
  const shown = useRef(new Set<InviteMoment>());
  const nowRef = useRef<number | null>(null);

  useEffect(() => {
    nowRef.current = Date.now();
    setMemory({
      firstSeen: inviteStorage.getFirstSeen(slug, orderNumber),
      dismissedAt: inviteStorage.getDismissedAt(slug, orderNumber),
    });
  }, [slug, orderNumber]);

  const picked = useMemo(
    () =>
      memory && orderNumber
        ? pickInviteMoment({
            order,
            firstSeen: memory.firstSeen,
            dismissedAt: memory.dismissedAt,
            now: nowRef.current ?? 0,
            receiptJustConfirmed,
          })
        : null,
    [memory, order, orderNumber, receiptJustConfirmed],
  );
  const moment: InviteMoment | null =
    picked === "entrega" && entregaHidden ? null : picked;

  // Reported once per moment per page load (StrictMode runs effects twice).
  useEffect(() => {
    if (!moment || shown.current.has(moment)) return;
    shown.current.add(moment);
    sendInviteEvent(token, "INVITE_SHOWN", moment);
    // "First open after validation" is remembered once the block was shown,
    // so the next visit gets the quiet banner instead.
    if (moment === "pago_validado") {
      inviteStorage.setFirstSeen(slug, orderNumber);
    }
  }, [moment, token, slug, orderNumber]);

  const clicked = useCallback(() => {
    if (moment) sendInviteEvent(token, "INVITE_CLICKED", moment);
  }, [moment, token]);

  const dismiss = useCallback(() => {
    if (!moment) return;
    sendInviteEvent(token, "INVITE_DISMISSED", moment);
    if (moment === "entrega") {
      setEntregaHidden(true);
      return;
    }
    const at = Date.now();
    inviteStorage.setDismissedAt(slug, orderNumber, at);
    setMemory((current) =>
      current ? { ...current, dismissedAt: at, firstSeen: true } : current,
    );
  }, [moment, token, slug, orderNumber]);

  return { moment, clicked, dismiss, eligible: isInviteEligible(order) };
}
