import { useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

/**
 * Mirrors the old shared `savedSection` 1.8s flash timer, but scoped to one
 * mutation instead of a single page-wide enum — flips a "Saved" button label
 * back to normal a moment after a successful save.
 */
export function useSavedFlash(isSuccess: boolean, reset: () => void) {
  useEffect(() => {
    if (!isSuccess) return;
    const timer = globalThis.setTimeout(() => reset(), 1800);
    return () => globalThis.clearTimeout(timer);
  }, [isSuccess, reset]);
}

export function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-[28px] border-[#eadcf7] bg-white py-0 shadow-sm">
      <CardHeader className="px-6 pt-6">
        <div className="flex items-start gap-3">
          <div className="store-theme-icon-surface flex size-11 items-center justify-center rounded-2xl">
            <Icon className="size-5" />
          </div>
          <div>
            <CardTitle className="text-lg text-[#2d1649]">{title}</CardTitle>
            <CardDescription className="mt-1 text-sm text-[#8f7da8]">
              {description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-6">{children}</CardContent>
    </Card>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#927fac]">
        {label}
      </span>
      {children}
    </label>
  );
}

export function ToggleRow({
  label,
  description,
  enabled,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] px-4 py-3">
      <div>
        <p className="text-sm font-medium text-[#341b55]">{label}</p>
        {description
          ? <p className="text-xs text-[#9582ad]">{description}</p>
          : null}
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={onChange}
        disabled={disabled}
        className="data-[checked]:bg-transparent"
        style={enabled
          ? {
            background:
              "linear-gradient(135deg, var(--store-accent) 0%, var(--store-primary) 100%)",
          }
          : undefined}
      />
    </div>
  );
}
