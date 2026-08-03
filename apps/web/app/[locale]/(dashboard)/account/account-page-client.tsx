"use client";

import { useTranslations } from "next-intl";
import { Clock, LogOut, Plus, ShoppingBag, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { LoadingState } from "@/components/shared/loading-state";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { authClient } from "@/lib/auth-client";
import { useMyStores } from "@/features/stores";
import { StatTile, useStatsOverview } from "@/features/stats";
import { ChangePasswordForm, StoreLinkCard } from "@/features/my-account";

export function AccountPageClient() {
  const t = useTranslations("dashboard.account");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const { data: stores, isPending: storesLoading, error: storesError } =
    useMyStores();

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-[#faf7fd] px-5 py-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#2d1649]">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-[#8f7da8]">{t("subtitle")}</p>
        </div>

        <Card className="rounded-[26px] border-[#eadcf8] bg-white py-0 shadow-sm">
          <CardContent className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium text-[#8f7da8]">
                {t("signedInAs")}
              </p>
              <p className="text-lg font-semibold text-[#2d1649]">
                {session?.user.name}
              </p>
              <p className="text-sm text-[#8f7da8]">{session?.user.email}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleSignOut}
              className="h-11 gap-2 rounded-2xl border-[#eadcf8] text-sm font-semibold text-[#2d1649]"
            >
              <LogOut className="size-4" />
              {t("signOut")}
            </Button>
          </CardContent>
        </Card>

        {storesLoading
          ? <LoadingState />
          : storesError
          ? <ErrorState message={tCommon("networkError")} />
          : stores && stores.length === 1
          ? <SingleStoreSummary storeId={stores[0].id} slug={stores[0].slug} />
          : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[#2d1649]">
                  {t("yourStores")}
                </h2>
                <Link
                  href="/onboarding/create-store"
                  className="flex items-center gap-1.5 text-sm font-semibold text-[#6d28d9] hover:underline"
                >
                  <Plus className="size-4" />
                  {t("addStore")}
                </Link>
              </div>
              {stores && stores.length > 0
                ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {stores.map((store) => (
                      <StoreLinkCard key={store.id} store={store} />
                    ))}
                  </div>
                )
                : <EmptyState message={t("yourStores")} />}
            </div>
          )}

        <ChangePasswordForm />
      </div>
    </div>
  );
}

function SingleStoreSummary(
  { storeId, slug }: { storeId: string; slug: string },
) {
  const t = useTranslations("dashboard.overview");
  const tAccount = useTranslations("dashboard.account");
  const { stats, loading, error } = useStatsOverview(storeId);

  if (loading) return <LoadingState />;
  if (error || !stats) return <ErrorState message={error ?? ""} />;

  const pendingReview = stats.paymentStatusCounts.PENDING_PAYMENT +
    stats.paymentStatusCounts.PARTIALLY_PAID +
    stats.paymentStatusCounts.PAYMENT_SUBMITTED;

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          icon={Wallet}
          label={t("stats.revenue")}
          value={stats.revenue.toFixed(2)}
        />
        <StatTile
          icon={ShoppingBag}
          label={t("stats.totalOrders")}
          value={String(stats.totalOrders)}
        />
        <StatTile
          icon={Clock}
          label={t("stats.pendingReview")}
          value={String(pendingReview)}
        />
      </div>
      <Link href={`/dashboard/${slug}`}>
        <Button className="h-11 w-full rounded-2xl bg-[#6d28d9] text-sm font-semibold text-white hover:bg-[#5b21b6] sm:w-auto">
          {tAccount("goToDashboard")}
        </Button>
      </Link>
    </div>
  );
}
