"use client";

import { MessageCircle, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildWhatsAppUrl } from "@biasmarket/utils/whatsapp";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CustomerListItemResponseDto } from "@biasmarket/types";

function getInitials(name: string | null, phone: string) {
  const source = (name ?? "").trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    const initialA = parts[0]?.slice(0, 1) ?? "";
    const initialB = parts[1]?.slice(0, 1) ?? "";
    return `${initialA}${initialB}`.toUpperCase() ||
      source.slice(0, 2).toUpperCase();
  }
  return phone.slice(-2).toUpperCase();
}

export function CustomerCard({
  customer,
  currency,
  onView,
}: {
  customer: CustomerListItemResponseDto;
  currency: string;
  onView: (customer: CustomerListItemResponseDto) => void;
}) {
  const t = useTranslations("dashboard.customers");
  const initials = getInitials(customer.name, customer.phone);
  const displayName = customer.name ?? customer.phone;

  return (
    <Card className="rounded-[26px] border-[#eadcf8] bg-white py-0 shadow-sm">
      <CardContent className="flex flex-col gap-4 px-5 py-5">
        <div className="flex items-center gap-3">
          <div
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--store-accent) 0%, var(--store-primary) 100%)",
            }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[#2d1649]">
              {displayName}
            </p>
            <p className="truncate text-xs text-[#8f7da8]">{customer.phone}</p>
          </div>
          {customer.emailVerified
            ? (
              <ShieldCheck
                className="size-4 shrink-0 text-emerald-600"
                aria-label={t("verified")}
              />
            )
            : null}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-[#f3ebff] pt-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#927fac]">
              {t("orderCount")}
            </p>
            <p className="text-sm font-bold text-[#2d1649]">
              {customer.orderCount}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#927fac]">
              {t("lifetimeSpend")}
            </p>
            <p className="text-sm font-bold text-[#2d1649]">
              {currency} {customer.lifetimeSpend.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onView(customer)}
            className="h-9 flex-1 rounded-2xl border-[#eadcf7] bg-white text-xs font-semibold text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
          >
            {t("viewHistory")}
          </Button>
          <a
            href={buildWhatsAppUrl(
              customer.phone,
              t("whatsappGreeting", { name: displayName }),
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-1.5 rounded-2xl border-[#eadcf7] bg-white px-3 text-xs font-semibold text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
            >
              <MessageCircle className="size-3.5" />
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
