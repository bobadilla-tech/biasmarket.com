"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

export function NewOrderButton({ slug }: { slug: string }) {
  const t = useTranslations("dashboard.orders");
  const router = useRouter();

  return (
    <Button
      type="button"
      onClick={() => router.push(`/dashboard/${slug}/orders/new`)}
      className="store-theme-primary-button h-11 rounded-2xl px-5 text-sm font-semibold hover:opacity-100"
    >
      <Plus className="size-4" />
      {t("newOrder")}
    </Button>
  );
}
