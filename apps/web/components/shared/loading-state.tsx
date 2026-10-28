import { Sparkles } from "lucide-react";
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
      className={cn("fan-loading-state flex flex-col gap-6 py-10", className)}
      role="status"
      aria-label={label}
    >
      <div className="fan-loading-intro" aria-hidden="true">
        <div className="fan-loading-mark">
          <span className="fan-loading-orbit" />
          <Sparkles className="fan-sparkle size-5" />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-40 rounded-lg" />
          <Skeleton className="h-3 w-56 max-w-full rounded-full" />
        </div>
      </div>

      <div className="fan-loading-cards" aria-hidden="true">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="fan-loading-card">
            <Skeleton className="aspect-[4/3] w-full rounded-xl" />
            <Skeleton className="mt-3 h-3.5 w-4/5 rounded-full" />
            <Skeleton className="mt-2 h-3 w-1/2 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
