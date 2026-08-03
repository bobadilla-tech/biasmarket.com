import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  selectClassName?: string;
}

export function Select(
  { className, selectClassName, children, ...props }: SelectProps,
) {
  return (
    <div className={cn("relative", className)}>
      <select
        {...props}
        className={cn(
          "h-full w-full appearance-none pl-3 pr-8",
          selectClassName,
        )}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 opacity-60" />
    </div>
  );
}
