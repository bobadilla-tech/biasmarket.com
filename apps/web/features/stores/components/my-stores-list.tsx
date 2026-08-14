"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useRouter } from "@/i18n/navigation";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useMyStores } from "../queries/use-my-stores";
import { useDeleteStore } from "../mutations/use-delete-store";

export function MyStoresList() {
  const { isReady } = useRequireAuth();
  const t = useTranslations("onboarding.createStore");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const { data: stores = [], isPending } = useMyStores({ enabled: isReady });
  const deleteStore = useDeleteStore();

  const handleDelete = (storeId: string) => {
    if (!confirm(t("confirmDelete"))) return;
    deleteStore.mutate(storeId, {
      onError: (error) =>
        alert(error instanceof Error ? error.message : t("deleteError")),
    });
  };

  if (!isReady) return null;

  return (
    <Card className="rounded-[30px] border-white/10 bg-[#2a0d50] py-0 text-white ring-white/10">
      <CardHeader className="px-5 pt-5">
        <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-white/45">
            Bias Market
          </p>
          <CardTitle className="mt-3 text-2xl font-bold text-white">
            {t("storesTitle")}
          </CardTitle>
          <CardDescription className="mt-2 text-sm text-white/65">
            {t("storesDescription")}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-5">
        {isPending ? (
          <p className="text-sm text-white/70">{tCommon("loading")}</p>
        ) : null}

        {!isPending && stores.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-white/14 bg-white/5 p-4 text-sm text-white/68">
            {t("empty")}
          </div>
        ) : null}

        {stores.map((store) => (
          <Card
            key={store.id}
            className="rounded-[22px] border-white/10 bg-white/6 py-0 text-white ring-white/10"
          >
            <CardContent className="px-4 py-4">
              <Button
                variant="ghost"
                onClick={() => router.push(`/dashboard/${store.slug}/settings`)}
                className="h-auto w-full justify-between px-0 py-0 text-left text-white hover:bg-transparent hover:text-white"
              >
                <div>
                  <p className="font-semibold">{store.name}</p>
                  <p className="mt-1 text-xs text-white/50">/{store.slug}</p>
                </div>
                <ChevronRight className="size-4 text-white/45" />
              </Button>
              <Button
                variant="link"
                onClick={() => handleDelete(store.id)}
                className="mt-3 h-auto p-0 text-xs font-semibold text-[#ff9bc7]"
              >
                {t("delete")}
              </Button>
            </CardContent>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
}
