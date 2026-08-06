"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { MessageCircle, PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingState } from "@/components/shared/loading-state";
import { useRestockRequests } from "../queries/use-restock-requests";
import type { RestockRequest } from "../schemas/restock-request.schema";

type SortMode = "count" | "date";

interface Group {
  productName: string;
  variantName: string | null;
  requests: RestockRequest[];
}

function groupRequests(requests: RestockRequest[]): Group[] {
  const byVariant = new Map<string, Group>();
  for (const request of requests) {
    const key = `${request.product.id}:${request.variant?.id ?? ""}`;
    const existing = byVariant.get(key);
    if (existing) {
      existing.requests.push(request);
    } else {
      byVariant.set(key, {
        productName: request.product.name,
        variantName: request.variant?.name ?? null,
        requests: [request],
      });
    }
  }
  return [...byVariant.values()];
}

function latestRequestDate(group: Group): number {
  return Math.max(
    ...group.requests.map((request) =>
      new Date(request.createdAt).getTime()
    ),
  );
}

function whatsappHref(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

export function RestockRequestsPanel({
  storeId,
  errorMessage,
}: {
  storeId: string | undefined;
  errorMessage: string;
}) {
  const t = useTranslations("dashboard.restock");
  const { locale } = useParams<{ locale: string }>();

  const [sort, setSort] = useState<SortMode>("date");
  const { data, isLoading, error } = useRestockRequests(storeId, errorMessage);

  const requests = data ?? [];
  const groups = useMemo(() => {
    const grouped = groupRequests(requests);
    if (sort === "count") {
      return grouped.sort((a, b) => b.requests.length - a.requests.length);
    }
    return grouped.sort(
      (a, b) => latestRequestDate(b) - latestRequestDate(a),
    );
  }, [requests, sort]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

  const sortOptions: { value: SortMode; label: string }[] = [
    { value: "date", label: t("sortDate") },
    { value: "count", label: t("sortCount") },
  ];

  return (
    <Card className="rounded-[30px] border-[#eadcf8] bg-white shadow-sm">
      <div className="flex flex-col gap-4 px-6 pt-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#2d1649]">
            {t("title")}
          </h2>
          <p className="mt-0.5 text-sm text-[#8f7da8]">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-[#eadcf7] bg-white p-1">
          {sortOptions.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant="ghost"
              onClick={() => setSort(option.value)}
              className={cn(
                "h-9 rounded-2xl px-4 text-sm font-semibold",
                sort === option.value
                  ? "store-theme-primary-button"
                  : "text-[#8f7da8] hover:bg-[#fcf9ff] hover:text-[#2d1649]",
              )}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <CardContent className="flex flex-col gap-4 px-6 pb-6 pt-5">
        {isLoading
          ? <LoadingState variant="inline" rows={3} />
          : error
          ? <ErrorState message={error instanceof Error ? error.message : errorMessage} />
          : requests.length === 0
          ? <EmptyState icon={PackageX} message={t("empty")} />
          : groups.map((group) => (
            <div
              key={`${group.productName}:${group.variantName ?? ""}`}
              className="rounded-2xl border border-[#f0e7f8] bg-white"
            >
              <div className="flex items-center justify-between gap-3 border-b border-[#f3ebff] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#2d1649]">
                    {group.productName}
                  </p>
                  {group.variantName && (
                    <p className="truncate text-xs text-[#8f7da8]">
                      {group.variantName}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-[#f0e7f8] px-3 py-1 text-xs font-semibold text-[#2d1649]">
                  {t("countLabel", { count: group.requests.length })}
                </span>
              </div>

              <ul className="divide-y divide-[#f3ebff]">
                {group.requests.map((request) => (
                  <li
                    key={request.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#2d1649]">
                        {request.name}
                      </p>
                      <p className="truncate text-xs text-[#8f7da8]">
                        {request.phone} ·{" "}
                        {dateFormatter.format(new Date(request.createdAt))}
                      </p>
                    </div>
                    <a
                      href={whatsappHref(request.phone)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--store-primary)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                    >
                      <MessageCircle className="size-3.5" />
                      {t("contact")}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
