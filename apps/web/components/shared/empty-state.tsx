import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  message,
  action,
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  message: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 px-4 py-6 text-center",
        className,
      )}
    >
      {Icon ? <Icon className="size-8 text-muted-foreground" /> : null}
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
