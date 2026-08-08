"use client";

import { useTranslations } from "next-intl";
import type { CustomerProfileResponseDto } from "@biasmarket/types";
import { CustomerChangePasswordForm } from "./customer-change-password-form";
import { EditContactForm } from "./edit-contact-form";

export function AccountProfileSection(
  { slug, profile }: { slug: string; profile: CustomerProfileResponseDto },
) {
  const t = useTranslations("storefront.accountPage");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-gray-900">{t("nav.profile")}</h1>
      <div className="flex flex-col gap-6">
        <EditContactForm slug={slug} profile={profile} />
        <CustomerChangePasswordForm slug={slug} />
      </div>
    </div>
  );
}
