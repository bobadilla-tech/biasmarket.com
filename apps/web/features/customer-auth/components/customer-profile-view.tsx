"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { CustomerProfileResponseDto } from "@biasmarket/types";
import { useCustomerLogout } from "../mutations/use-customer-logout";
import { type AccountSection, AccountSidebar } from "./account-sidebar";
import { AccountOrdersSection } from "./account-orders-section";
import { AccountAddressesSection } from "./account-addresses-section";
import { AccountProfileSection } from "./account-profile-section";

export function CustomerProfileView(
  { slug, profile }: { slug: string; profile: CustomerProfileResponseDto },
) {
  const router = useRouter();
  const logout = useCustomerLogout(slug);
  const [section, setSection] = useState<AccountSection>("orders");

  const handleLogout = async () => {
    await logout.mutateAsync();
    router.push(`/store/${slug}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto flex max-w-5xl flex-col md:flex-row md:gap-8 md:px-6 md:py-10">
        <AccountSidebar
          slug={slug}
          profile={profile}
          section={section}
          onSectionChange={setSection}
          onLogout={handleLogout}
          logoutPending={logout.isPending}
        />
        <main className="flex-1 px-6 py-6 md:px-0 md:py-0">
          {section === "orders" && (
            <AccountOrdersSection slug={slug} profile={profile} />
          )}
          {section === "addresses" && <AccountAddressesSection slug={slug} />}
          {section === "profile" && (
            <AccountProfileSection slug={slug} profile={profile} />
          )}
        </main>
      </div>
    </div>
  );
}
