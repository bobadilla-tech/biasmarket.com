/* eslint-disable jsx-a11y/no-noninteractive-tabindex */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function DataTable({
  caption,
  children,
  className,
}: {
  caption: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className={cn(
        "overflow-x-auto focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DataTableCaption({ children }: { children: ReactNode }) {
  return <caption className="sr-only">{children}</caption>;
}
