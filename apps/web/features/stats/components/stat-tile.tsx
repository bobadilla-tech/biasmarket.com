import type { ComponentType } from "react";
import { Card, CardContent } from "@/components/ui/card";

export function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card className="rounded-[26px] border-[#eadcf8] bg-white py-0 shadow-sm">
      <CardContent className="flex items-center gap-4 px-5 py-5">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#f4ecfb] text-[var(--store-primary)]">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-[#8f7da8]">{label}</p>
          <p className="truncate text-2xl font-bold tracking-tight text-[#2d1649]">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
