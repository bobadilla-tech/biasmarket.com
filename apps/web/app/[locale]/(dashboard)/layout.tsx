import { ImpersonationBanner } from "@/components/dashboard/impersonation-banner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ImpersonationBanner />
      {children}
    </>
  );
}
