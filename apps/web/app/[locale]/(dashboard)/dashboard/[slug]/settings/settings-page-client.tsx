"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CreditCard, MessageCircle, Palette, Store, Truck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StoreLogo } from "@/components/store-logo";
import { useDashboardStore } from "@/features/stores";
import {
  AppearanceSection,
  DefaultsSection,
  DeliverySection,
  NotificationsSection,
  PaymentsSection,
  ProfileSection,
  StoreContentSection,
  useWhatsAppTemplates,
  WhatsAppMessagesSection,
} from "@/features/store-settings";
import { CouriersSection } from "@/features/couriers";
import { RegisterPreferenceSection } from "@/features/store-settings/components/register-preference-section";
import { cn } from "@/lib/utils";
import {
  SettingsDraftProvider,
  type SettingsTabId,
  useSettingsDraftContext,
} from "@/features/store-settings/components/settings-save-context";

const TAB_IDS = [
  "store",
  "payments",
  "delivery",
  "appearance",
  "messages",
] as const;
type TabId = (typeof TAB_IDS)[number];

export function SettingsPageClient() {
  return (
    <SettingsDraftProvider>
      <SettingsPageContent />
    </SettingsDraftProvider>
  );
}

function SettingsPageContent() {
  const t = useTranslations("dashboard.settings");
  const tCommon = useTranslations("common");
  const { store, loading: storeLoading } = useDashboardStore();
  const storeId = store?.id;
  const previewName = store?.name ?? "";
  const previewBio = store?.bio ?? "";
  const previewWhatsapp = store?.whatsappNumber ?? "";
  const previewInstagram = store?.instagramUrl ?? "";
  const previewFacebook = store?.facebookUrl ?? "";
  const previewTiktok = store?.tiktokUrl ?? "";
  const previewTwitter = store?.twitterUrl ?? "";
  const initialStorePreview = {
    name: previewName,
    bio: previewBio,
    whatsappNumber: previewWhatsapp,
    instagramUrl: previewInstagram,
    facebookUrl: previewFacebook,
    tiktokUrl: previewTiktok,
    twitterUrl: previewTwitter,
  };
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tablistRef = useRef<HTMLDivElement>(null);
  const {
    isDirty: tabIsDirty,
    canSave: tabCanSave,
    save: saveTab,
    discard: discardTab,
    isSaving,
    errors: saveErrors,
  } = useSettingsDraftContext();
  const [pendingTab, setPendingTab] = useState<TabId | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null,
  );
  const leaveDialogRef = useRef<HTMLDivElement>(null);
  const leaveCancelRef = useRef<HTMLButtonElement>(null);
  const storePreviewSeeded = useRef(false);
  const [storePreview, setStorePreview] = useState(initialStorePreview);
  useEffect(() => {
    if (!storeId || storePreviewSeeded.current) return;
    storePreviewSeeded.current = true;
    setStorePreview({
      name: previewName,
      bio: previewBio,
      whatsappNumber: previewWhatsapp,
      instagramUrl: previewInstagram,
      facebookUrl: previewFacebook,
      tiktokUrl: previewTiktok,
      twitterUrl: previewTwitter,
    });
  }, [
    storeId,
    previewName,
    previewBio,
    previewWhatsapp,
    previewInstagram,
    previewFacebook,
    previewTiktok,
    previewTwitter,
  ]);
  const updateStorePreview = useCallback(
    (values: Partial<typeof storePreview>) => {
      setStorePreview((current) => ({ ...current, ...values }));
    },
    [],
  );
  const requestedTab = searchParams.get("tab");
  const activeTab: TabId = TAB_IDS.includes(requestedTab as TabId)
    ? (requestedTab as TabId)
    : "store";
  const previousTabRef = useRef(activeTab);
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(
    () => new Set([activeTab]),
  );
  useEffect(() => {
    setVisitedTabs((visited) =>
      visited.has(activeTab) ? visited : new Set([...visited, activeTab]),
    );
  }, [activeTab]);
  useEffect(() => {
    const previousTab = previousTabRef.current;
    if (activeTab === previousTab) return;
    if (tabIsDirty(previousTab)) {
      setPendingTab(activeTab);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", previousTab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      return;
    }
    previousTabRef.current = activeTab;
  }, [activeTab, pathname, router, searchParams, tabIsDirty]);
  const { data: whatsappTemplates, isPending: whatsappLoading } =
    useWhatsAppTemplates(store?.id);

  useEffect(() => {
    if (!requestedTab || !TAB_IDS.includes(requestedTab as TabId)) {
      router.replace(`${pathname}?tab=store`, { scroll: false });
    }
  }, [pathname, requestedTab, router]);

  const selectTab = useCallback(
    (tab: TabId) => {
      if (tab !== activeTab && tabIsDirty(activeTab)) {
        setPendingTab(tab);
        return;
      }
      setPendingTab(null);
      setVisitedTabs((visited) =>
        visited.has(tab) ? visited : new Set([...visited, tab]),
      );
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [activeTab, pathname, router, searchParams, tabIsDirty],
  );

  const continueToPendingTab = useCallback(
    async (shouldSave: boolean) => {
      if (!pendingTab && !pendingNavigation) return;
      if (shouldSave && !(await saveTab(activeTab))) return;
      if (!shouldSave) discardTab(activeTab);
      if (pendingNavigation) {
        const destination = pendingNavigation;
        setPendingNavigation(null);
        setPendingTab(null);
        router.push(destination);
        return;
      }
      const nextTab = pendingTab;
      if (!nextTab) return;
      setPendingTab(null);
      setVisitedTabs((visited) => new Set([...visited, nextTab]));
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", nextTab);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [
      activeTab,
      discardTab,
      pathname,
      pendingTab,
      pendingNavigation,
      router,
      saveTab,
      searchParams,
    ],
  );

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!tabIsDirty(activeTab)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [activeTab, tabIsDirty]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download"))
        return;
      const destination = new URL(link.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        destination.pathname === pathname ||
        !tabIsDirty(activeTab)
      )
        return;
      event.preventDefault();
      setPendingTab(null);
      setPendingNavigation(
        `${destination.pathname}${destination.search}${destination.hash}`,
      );
    };
    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [activeTab, pathname, tabIsDirty]);

  useEffect(() => {
    if (!pendingTab && !pendingNavigation) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    leaveCancelRef.current?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = leaveDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      previouslyFocused?.focus();
    };
  }, [pendingTab, pendingNavigation]);

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const focusedTab = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-tab]",
    )?.dataset.tab;
    const currentIndex = TAB_IDS.indexOf((focusedTab ?? activeTab) as TabId);
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight")
      nextIndex = (currentIndex + 1) % TAB_IDS.length;
    if (event.key === "ArrowLeft")
      nextIndex = (currentIndex + TAB_IDS.length - 1) % TAB_IDS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = TAB_IDS.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextTab = TAB_IDS[nextIndex];
    selectTab(nextTab);
    tablistRef.current
      ?.querySelector<HTMLButtonElement>(`[data-tab="${nextTab}"]`)
      ?.focus();
  };

  const tabs = [
    { id: "store", icon: Store, label: t("profile.title") },
    { id: "payments", icon: CreditCard, label: t("payments.title") },
    { id: "delivery", icon: Truck, label: t("delivery.title") },
    { id: "appearance", icon: Palette, label: t("appearance.title") },
    { id: "messages", icon: MessageCircle, label: t("whatsappMessages.title") },
  ] as const;

  if (storeLoading || !store) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-sm text-[#8f7da8]">
        {tCommon("loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-5 pb-36 sm:px-5 lg:px-8 lg:py-8 lg:pb-36">
      <div className="mx-auto max-w-6xl space-y-5">
        <Card className="rounded-[28px] border-white/60 bg-white/70 py-0 shadow-[0_10px_35px_rgba(89,35,126,0.05)] backdrop-blur">
          <CardContent className="flex items-center justify-between gap-4 px-5 py-5 sm:px-7">
            <div>
              <p className="text-sm font-medium text-[#8e7ca7]">
                {t("eyebrow")}
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-[#2d1649]">
                {t("title")}
              </h1>
              <p className="mt-1 text-sm text-[#8f7da8]">{t("subtitle")}</p>
            </div>
            <StoreLogo
              name={store.name}
              logoUrl={store.logoUrl ?? null}
              size={48}
              className="shrink-0 text-sm font-semibold"
              style={{ boxShadow: "0 10px 30px var(--store-shadow)" }}
            />
          </CardContent>
        </Card>

        <div
          ref={tablistRef}
          role="tablist"
          aria-label={t("title")}
          onKeyDown={onTabKeyDown}
          className="flex gap-2 overflow-x-auto rounded-2xl border border-[#eadcf7] bg-white/75 p-2 shadow-sm [scrollbar-width:thin]"
        >
          {tabs.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              id={`settings-tab-${id}`}
              data-tab={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={`settings-panel-${id}`}
              tabIndex={activeTab === id ? 0 : -1}
              onClick={() => selectTab(id)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a45cc]",
                activeTab === id
                  ? "bg-[#5c2b83] text-white shadow-sm"
                  : "text-[#72558e] hover:bg-[#f6effb] hover:text-[#40205c]",
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              <span>{label}</span>
              {tabIsDirty(id) ? (
                <span
                  aria-label={t("saveBar.dirty")}
                  className={cn(
                    "size-2 rounded-full",
                    activeTab === id ? "bg-white" : "bg-[#b24368]",
                  )}
                />
              ) : null}
            </button>
          ))}
        </div>

        {TAB_IDS.map((tab) => (
          <section
            key={tab}
            id={`settings-panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`settings-tab-${tab}`}
            hidden={activeTab !== tab}
            className="min-h-[24rem] space-y-5 focus-visible:outline-none"
          >
            {visitedTabs.has(tab) ? (
              <>
                {tab === "store" ? (
                  <>
                    <RegisterPreferenceSection />
                    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
                      <div className="min-w-0 space-y-5">
                        <ProfileSection
                          store={store}
                          onPreviewChange={updateStorePreview}
                        />
                        <StoreContentSection
                          store={store}
                          onPreviewChange={updateStorePreview}
                        />
                      </div>
                      <details className="group lg:hidden">
                        <summary className="cursor-pointer list-none rounded-[28px] border border-[#eadcf7] bg-white px-5 py-4 text-sm font-semibold text-[#5b3d80] shadow-sm marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a45cc] [&::-webkit-details-marker]:hidden">
                          <span>{t("storeContent.previewLabel")}</span>
                          <span className="float-right text-xs font-medium text-[#8f7da8] group-open:hidden">
                            {t("storeContent.previewShow")}
                          </span>
                          <span className="float-right hidden text-xs font-medium text-[#8f7da8] group-open:inline">
                            {t("storeContent.previewHide")}
                          </span>
                        </summary>
                        <div className="mt-3">
                          <StorePreviewCard
                            store={store}
                            preview={storePreview}
                            labels={getStorePreviewLabels(t)}
                          />
                        </div>
                      </details>
                      <aside className="hidden lg:sticky lg:top-5 lg:block">
                        <StorePreviewCard
                          store={store}
                          preview={storePreview}
                          labels={getStorePreviewLabels(t)}
                        />
                      </aside>
                    </div>
                    <DefaultsSection store={store} />
                  </>
                ) : null}
                {tab === "payments" ? (
                  <PaymentsSection
                    storeId={store.id}
                    initialPaymentInstructions={store.paymentInstructions ?? ""}
                  />
                ) : null}
                {tab === "delivery" ? (
                  <>
                    <DeliverySection storeId={store.id} />
                    <CouriersSection storeId={store.id} />
                  </>
                ) : null}
                {tab === "appearance" ? (
                  <AppearanceSection store={store} />
                ) : null}
                {tab === "messages" ? (
                  <>
                    <NotificationsSection store={store} />
                    <WhatsAppMessagesSection
                      storeId={store.id}
                      templates={
                        whatsappTemplates
                          ? {
                              newOrder:
                                whatsappTemplates.newOrder?.template ?? null,
                              paymentReminder:
                                whatsappTemplates.paymentReminder?.template ??
                                null,
                              assistedOrderLink:
                                whatsappTemplates.assistedOrderLink?.template ??
                                null,
                              paymentValidated:
                                whatsappTemplates.paymentValidated?.template ??
                                null,
                              inTransit:
                                whatsappTemplates.inTransit?.template ?? null,
                              ready: whatsappTemplates.ready?.template ?? null,
                              delivered:
                                whatsappTemplates.delivered?.template ?? null,
                            }
                          : undefined
                      }
                      loading={whatsappLoading}
                    />
                  </>
                ) : null}
              </>
            ) : null}
          </section>
        ))}
      </div>
      <SettingsSaveBar
        activeTab={activeTab}
        dirty={tabIsDirty(activeTab)}
        canSave={tabCanSave(activeTab)}
        saving={isSaving}
        errors={saveErrors}
        onSave={() => void saveTab(activeTab)}
        onDiscard={() => discardTab(activeTab)}
        labels={{
          saved: t("saveBar.saved"),
          dirty: t("saveBar.dirty"),
          save: t("saveBar.save"),
          saving: t("saveBar.saving"),
          discard: t("saveBar.discard"),
          errors: t("saveBar.errors"),
        }}
      />
      {pendingTab || pendingNavigation ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[#251632]/40 p-4"
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="settings-unsaved-title"
            ref={leaveDialogRef}
            className="w-full max-w-md rounded-3xl border border-[#eadcf7] bg-white p-6 shadow-2xl"
          >
            <h2
              id="settings-unsaved-title"
              className="text-lg font-bold text-[#2d1649]"
            >
              {t("saveBar.leaveTitle")}
            </h2>
            <p className="mt-2 text-sm text-[#72558e]">
              {t("saveBar.leaveDescription")}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                ref={leaveCancelRef}
                onClick={() => {
                  setPendingTab(null);
                  setPendingNavigation(null);
                }}
                className="h-10 rounded-xl border border-[#eadcf7] px-4 text-sm font-semibold text-[#72558e]"
              >
                {t("saveBar.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void continueToPendingTab(false)}
                className="h-10 rounded-xl border border-[#eadcf7] px-4 text-sm font-semibold text-[#72558e]"
              >
                {t("saveBar.discardAndContinue")}
              </button>
              <button
                type="button"
                onClick={() => void continueToPendingTab(true)}
                disabled={isSaving || !tabCanSave(activeTab)}
                className="store-theme-primary-button h-10 rounded-xl px-4 text-sm font-semibold"
              >
                {t("saveBar.saveAndContinue")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SettingsSaveBar({
  activeTab,
  dirty,
  canSave,
  saving,
  errors,
  onSave,
  onDiscard,
  labels,
}: {
  activeTab: SettingsTabId;
  dirty: boolean;
  canSave: boolean;
  saving: boolean;
  errors: string[];
  onSave: () => void;
  onDiscard: () => void;
  labels: Record<
    "saved" | "dirty" | "save" | "saving" | "discard" | "errors",
    string
  >;
}) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#eadcf7] bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(45,22,73,0.12)] backdrop-blur sm:px-6"
      data-tab={activeTab}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p aria-live="polite" className="text-sm font-medium text-[#5b3d80]">
            {dirty ? labels.dirty : labels.saved}
          </p>
          {errors.length ? (
            <p role="alert" className="mt-1 text-xs text-[#b24368]">
              {labels.errors}: {errors.join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={!dirty || saving}
            className="h-10 rounded-xl border border-[#eadcf7] px-4 text-sm font-semibold text-[#72558e] disabled:opacity-45"
          >
            {labels.discard}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || !canSave || saving}
            className="store-theme-primary-button h-10 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? labels.saving : labels.save}
          </button>
        </div>
      </div>
    </div>
  );
}

type StorePreviewValues = {
  name: string;
  bio: string;
  whatsappNumber: string;
  instagramUrl: string;
  facebookUrl: string;
  tiktokUrl: string;
  twitterUrl: string;
};

function StorePreviewCard({
  store,
  preview,
  labels,
}: {
  store: NonNullable<ReturnType<typeof useDashboardStore>["store"]>;
  preview: StorePreviewValues;
  labels: {
    previewLabel: string;
    livePreviewDescription: string;
    bannerPreviewAlt: string;
    emptyName: string;
    previewEmpty: string;
  };
}) {
  return (
    <Card className="overflow-hidden rounded-[28px] border-[#eadcf7] bg-white shadow-[0_16px_45px_rgba(89,35,126,0.09)]">
      <div className="border-b border-[#eadcf7] px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e7ca7]">
          {labels.previewLabel}
        </p>
        <p className="mt-1 text-sm text-[#8f7da8]">
          {labels.livePreviewDescription}
        </p>
      </div>
      <div className="p-4 sm:p-5">
        {store.bannerUrl ? (
          <img
            src={store.bannerUrl}
            alt={labels.bannerPreviewAlt}
            className="mb-4 aspect-[3/1] w-full rounded-2xl object-cover"
          />
        ) : null}
        <div className="flex items-center gap-3">
          <StoreLogo
            name={preview.name}
            logoUrl={store.logoUrl ?? null}
            size={56}
            className="shrink-0 rounded-2xl text-base font-bold"
          />
          <h2 className="min-w-0 break-words text-lg font-bold text-[#2d1649]">
            {preview.name || labels.emptyName}
          </h2>
        </div>
        <p className="mt-4 min-h-10 whitespace-pre-wrap break-words text-sm leading-6 text-[#725d88]">
          {preview.bio || labels.previewEmpty}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ["Instagram", preview.instagramUrl],
            ["Facebook", preview.facebookUrl],
            ["TikTok", preview.tiktokUrl],
            ["X", preview.twitterUrl],
          ]
            .filter(([, url]) => Boolean(url))
            .map(([label, url]) => (
              <a
                key={label}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-[#eadcf7] bg-[#fcf9ff] px-3 py-1.5 text-xs font-semibold text-[#5b3d80] hover:bg-[#f4ebfb]"
              >
                {label}
              </a>
            ))}
        </div>
        {preview.whatsappNumber ? (
          <div className="mt-5 rounded-2xl bg-[#f3faef] px-4 py-3 text-sm font-semibold text-[#376b35]">
            WhatsApp · {preview.whatsappNumber}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function getStorePreviewLabels(
  t: ReturnType<typeof useTranslations<"dashboard.settings">>,
) {
  return {
    previewLabel: t("storeContent.previewLabel"),
    livePreviewDescription: t("storeContent.livePreviewDescription"),
    bannerPreviewAlt: t("profile.bannerPreviewAlt"),
    emptyName: t("emptyName"),
    previewEmpty: t("storeContent.previewEmpty"),
  };
}
