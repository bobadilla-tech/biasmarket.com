"use client";

import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { useId } from "react";

import { cn } from "@/lib/utils";

function RadioCardGroup({
  className,
  ...props
}: RadioGroupPrimitive.Props<string>) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-card-group"
      className={cn("grid gap-3", className)}
      {...props}
    />
  );
}

function RadioCard({
  className,
  children,
  "aria-labelledby": ariaLabelledBy,
  id: idProp,
  ...props
}: RadioPrimitive.Root.Props<string>) {
  const generatedId = useId();

  return (
    <RadioPrimitive.Root
      data-slot="radio-card"
      className={cn(
        "group relative flex min-h-20 cursor-pointer flex-col items-start gap-1 rounded-2xl border border-border bg-background p-4 text-left outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-primary data-checked:bg-primary/5 data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      id={idProp ?? generatedId}
      aria-labelledby={ariaLabelledBy ?? ""}
      {...props}
    >
      {children}
    </RadioPrimitive.Root>
  );
}

function RadioCardIndicator({
  className,
  ...props
}: RadioPrimitive.Indicator.Props) {
  return (
    <RadioPrimitive.Indicator
      data-slot="radio-card-indicator"
      className={cn(
        "absolute top-3 right-3 inline-flex size-5 items-center justify-center rounded-full border border-primary text-primary data-unchecked:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

export { RadioCard, RadioCardGroup, RadioCardIndicator };
