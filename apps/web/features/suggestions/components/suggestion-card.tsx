"use client";

import { AlertTriangle, type Info, Lightbulb, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SuggestionResponseDto } from "@biasmarket/types";

// bodyParams comes off the generated client as `{ [key: string]: unknown }`
// (the OpenAPI `additionalProperties: true` escape hatch, needed because
// JSON Schema has no `string | number` value union) — the backend really
// does only ever put strings/numbers in it (see suggestions.service.ts).
function asI18nValues(
  bodyParams: SuggestionResponseDto["bodyParams"],
): Record<string, string | number> {
  return bodyParams as Record<string, string | number>;
}

const SEVERITY_STYLES: Record<
  SuggestionResponseDto["severity"],
  { icon: typeof Info; className: string }
> = {
  info: { icon: Lightbulb, className: "bg-violet-50 text-violet-700" },
  warning: { icon: AlertTriangle, className: "bg-amber-50 text-amber-700" },
  critical: { icon: AlertTriangle, className: "bg-red-50 text-red-700" },
};

export function SuggestionCard({
  suggestion,
  onDismiss,
}: {
  suggestion: SuggestionResponseDto;
  onDismiss: (id: string) => void;
}) {
  // titleKey is driven by the backend's rule id (e.g. "lowStock"), not a
  // compile-time-known literal, so it can't match next-intl's strict
  // per-namespace key typing — cast to a plain dynamic-key signature.
  const t = useTranslations("dashboard.preferences.suggestions") as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;
  const tCommon = useTranslations("dashboard.preferences");
  const { icon: Icon, className } = SEVERITY_STYLES[suggestion.severity];

  return (
    <Card className="rounded-[26px] border-[#eadcf8] bg-white py-0 shadow-sm">
      <CardContent className="flex items-start gap-4 px-5 py-5">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-2xl",
            className,
          )}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#2d1649]">
            {t(
              `${suggestion.titleKey}.title`,
              asI18nValues(suggestion.bodyParams),
            )}
          </p>
          <p className="mt-1 text-sm text-[#8f7da8]">
            {t(
              `${suggestion.titleKey}.body`,
              asI18nValues(suggestion.bodyParams),
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onDismiss(suggestion.id)}
          aria-label={tCommon("dismiss")}
          className="size-8 shrink-0 rounded-full p-0 text-[#8f7da8] hover:bg-[#fcf9ff]"
        >
          <X className="size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
