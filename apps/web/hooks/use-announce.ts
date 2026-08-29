"use client";

import { createElement, useCallback, useState } from "react";

type AnnouncementPriority = "polite" | "assertive";

export function useAnnounce() {
  const [announcement, setAnnouncement] = useState<{
    id: number;
    message: string;
    priority: AnnouncementPriority;
  } | null>(null);

  const announce = useCallback(
    (message: string, priority: AnnouncementPriority = "polite") => {
      setAnnouncement((previous) => ({
        id: (previous?.id ?? 0) + 1,
        message,
        priority,
      }));
    },
    [],
  );

  const liveRegion = createElement(
    "div",
    {
      key: announcement?.id,
      role: announcement?.priority === "assertive" ? "alert" : "status",
      "aria-live": announcement?.priority ?? "polite",
      "aria-atomic": "true",
      className: "sr-only",
    },
    announcement?.message ?? "",
  );

  return { announce, liveRegion };
}
