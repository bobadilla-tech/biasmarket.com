"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StoreLogo } from "@/components/store-logo";
import { useDashboardStore } from "@/features/stores";
import {
  AppearanceSection,
  DefaultsSection,
  DeliverySection,
  NotificationsSection,
  PaymentsSection,
  ProfileSection,
  useWhatsAppTemplates,
  WhatsAppMessagesSection,
} from "@/features/store-settings";
import { CouriersSection } from "@/features/couriers";

export function SettingsPageClient() {
  const t = useTranslations("dashboard.settings");
  const tCommon = useTranslations("common");
  const { store, loading: storeLoading } = useDashboardStore();
  const { data: whatsappTemplates, isPending: whatsappLoading } =
    useWhatsAppTemplates(store?.id);

  if (storeLoading || !store) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-sm text-[#8f7da8]">
        {tCommon("loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen px-5 py-6 lg:px-8 lg:py-8">
      <div className="space-y-6">
        <Card className="rounded-[28px] border-white/60 bg-white/55 py-0 shadow-[0_10px_35px_rgba(89,35,126,0.05)] backdrop-blur">
          <CardContent className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-[#8e7ca7]">
                {t("eyebrow")}
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-[#2d1649]">
                {t("title")}
              </h1>
              <p className="mt-1 text-sm text-[#8f7da8]">{t("subtitle")}</p>
            </div>
            <div className="flex items-center gap-3">
              <Input
                value={t("searchPlaceholder")}
                readOnly
                className="hidden min-w-[250px] rounded-2xl border-[#eadcf7] bg-white text-[#a18eb8] shadow-none sm:flex"
              />
              <StoreLogo
                name={store.name}
                logoUrl={store.logoUrl ?? null}
                size={48}
                className="text-sm font-semibold"
                style={{ boxShadow: "0 10px 30px var(--store-shadow)" }}
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="space-y-6">
            <ProfileSection store={store} />
            <AppearanceSection store={store} />
            <PaymentsSection storeId={store.id} />
            <WhatsAppMessagesSection
              storeId={store.id}
              templates={
                whatsappTemplates
                  ? {
                      newOrder: whatsappTemplates.newOrder?.template ?? null,
                      paymentReminder:
                        whatsappTemplates.paymentReminder?.template ?? null,
                    }
                  : undefined
              }
              loading={whatsappLoading}
            />
          </div>

          <div className="space-y-6">
            <DeliverySection storeId={store.id} />
            <CouriersSection storeId={store.id} />
            <DefaultsSection store={store} />
            <NotificationsSection store={store} />
          </div>
        </div>
      </div>
    </div>
  );
}
