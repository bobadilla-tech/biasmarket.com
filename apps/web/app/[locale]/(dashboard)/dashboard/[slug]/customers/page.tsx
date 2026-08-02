"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LoadingState } from "@/components/shared/loading-state";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { useDashboardStore } from "@/features/stores";
import {
  useCustomers,
  CustomerCard,
  CustomerDetailSheet,
  type CustomerListItem,
} from "@/features/customers";

export default function CustomersPage() {
  const t = useTranslations("dashboard.customers");
  const tCommon = useTranslations("common");
  const { store, storeId, loading: storeLoading } = useDashboardStore();
  const { data: customers, isPending: customersLoading, error } = useCustomers(
    storeId,
    tCommon("networkError"),
  );

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const handleView = (customer: CustomerListItem) => {
    setSelectedCustomerId(customer.id);
    setDetailsOpen(true);
  };

  if (storeLoading || customersLoading) {
    return <LoadingState />;
  }

  if (error) {
    return (
      <div className="px-5 py-6 lg:px-8 lg:py-8">
        <ErrorState message={error instanceof Error ? error.message : tCommon("networkError")} />
      </div>
    );
  }

  const currency = store?.defaultCurrency ?? "PEN";

  return (
    <div className="min-h-screen px-5 py-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[#8e7ca7]">{t("subtitle")}</p>
          <h1 className="text-3xl font-bold tracking-tight text-[#2d1649]">
            {t("titleWithCount", { count: customers?.length ?? 0 })}
          </h1>
        </div>

        {!customers || customers.length === 0 ? (
          <EmptyState message={t("empty")} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {customers.map((customer) => (
              <CustomerCard
                key={customer.id}
                customer={customer}
                currency={currency}
                onView={handleView}
              />
            ))}
          </div>
        )}
      </div>

      <CustomerDetailSheet
        storeId={storeId}
        customerId={selectedCustomerId}
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) setSelectedCustomerId(null);
        }}
      />
    </div>
  );
}
