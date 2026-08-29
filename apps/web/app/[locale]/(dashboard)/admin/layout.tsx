"use client";

import { useEffect } from "react";
import { AppSidebar } from "@/components/admin/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LoadingState } from "@/components/shared/loading-state";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "@/i18n/navigation";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const isAdmin = session?.user.role === "admin";
  const impersonatedBy = (
    session?.session as { impersonatedBy?: string | null } | undefined
  )?.impersonatedBy;

  useEffect(() => {
    if (!isPending && !isAdmin && !impersonatedBy) {
      router.push("/dashboard");
    }
  }, [isPending, isAdmin, impersonatedBy, router]);

  if (isPending || (!isAdmin && !impersonatedBy)) {
    return <LoadingState />;
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset id="main-content" tabIndex={-1}>
          <header className="flex h-12 items-center gap-2 border-b border-gray-100 px-4">
            <SidebarTrigger />
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
