"use client";

import { ImpersonationBanner } from "@/components/dashboard/impersonation-banner";
import { LoadingState } from "@/components/shared/loading-state";
import { useRequireAuth } from "@/hooks/use-require-auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isReady } = useRequireAuth();

  if (!isReady) return <LoadingState />;

  return (
    <>
      <ImpersonationBanner />
      {children}
    </>
  );
}
