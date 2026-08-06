"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  clearImpersonationHistory,
  getImpersonationHistory,
  setImpersonationHistory,
} from "@/lib/impersonation-history";

export function ImpersonationBanner() {
  const t = useTranslations("common.impersonation");
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const syncingRef = useRef(false);
  const impersonatedBy = (
    session?.session as { impersonatedBy?: string | null } | undefined
  )?.impersonatedBy;

  useEffect(() => {
    const history = getImpersonationHistory();
    const onAdminRoute = pathname.startsWith("/admin");

    if (syncingRef.current || !history) return;

    // Browser back from a store dashboard to the admin panel exits the
    // impersonation session, while retaining enough state for browser
    // forward to restore the same store.
    if (onAdminRoute && impersonatedBy && history.active) {
      syncingRef.current = true;
      setImpersonationHistory({ ...history, active: false });
      void authClient.admin.stopImpersonating()
        .then(() => queryClient.invalidateQueries())
        .catch(() => {
          setImpersonationHistory({ ...history, active: true });
        })
        .finally(() => {
          syncingRef.current = false;
        });
      return;
    }

    // Browser forward back to the same dashboard restores impersonation.
    if (
      !onAdminRoute &&
      pathname === history.path &&
      !impersonatedBy &&
      !history.active
    ) {
      syncingRef.current = true;
      void authClient.admin.impersonateUser({ userId: history.userId })
        .then(() => {
          setImpersonationHistory({ ...history, active: true });
          queryClient.invalidateQueries();
        })
        .catch(() => {
          setImpersonationHistory({ ...history, active: false });
        })
        .finally(() => {
          syncingRef.current = false;
        });
    }
  }, [impersonatedBy, pathname, queryClient]);

  if (!impersonatedBy) return null;

  const handleStop = async () => {
    syncingRef.current = true;
    clearImpersonationHistory();
    try {
      await authClient.admin.stopImpersonating();
      await queryClient.invalidateQueries();
      router.push("/admin/stores");
    } finally {
      syncingRef.current = false;
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
      <span>{t("banner", { email: session?.user.email ?? "" })}</span>
      <button
        onClick={handleStop}
        className="rounded-lg bg-amber-950/10 px-3 py-1 text-xs font-semibold hover:bg-amber-950/20"
      >
        {t("stop")}
      </button>
    </div>
  );
}
