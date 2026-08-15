"use client";

import { ImpersonationBanner } from "@/components/dashboard/impersonation-banner";
import { useRequireAuth } from "@/hooks/use-require-auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isReady } = useRequireAuth();

  if (!isReady) return null;

  return (
    <>
      <ImpersonationBanner />
      {children}
    </>
  );
}
