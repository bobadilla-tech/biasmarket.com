"use client";

import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "@/i18n/navigation";

export function ImpersonationBanner() {
  const t = useTranslations("common.impersonation");
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const impersonatedBy = (
    session?.session as { impersonatedBy?: string | null } | undefined
  )?.impersonatedBy;

  if (!impersonatedBy) return null;

  const handleStop = async () => {
    await authClient.admin.stopImpersonating();
    router.push("/admin/stores");
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
