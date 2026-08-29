import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingState({
  variant = "page",
  rows = 3,
  className,
  label = "Loading",
}: {
  variant?: "page" | "inline";
  rows?: number;
  className?: string;
  label?: string;
}) {
  if (variant === "inline") {
    return (
      <div
        className={cn("flex flex-col gap-2", className)}
        role="status"
        aria-label={label}
      >
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col gap-3 py-10", className)}
      role="status"
      aria-label={label}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-2xl" />
      ))}
    </div>
  );
}
