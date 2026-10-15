"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Link, useRouter } from "@/i18n/navigation";
import { resolveSellerHomePath } from "../lib/seller-home-path";

// Landing step after better-auth's GET /verify-email redirects back to web.
// With `autoSignInAfterVerification` the API has already set the session
// cookie, so this just forwards the seller to their home. No session means
// the link was already used (better-auth redirects without signing in when
// the user is already verified) — fall back to the manual login link.
export function EmailVerifiedRedirect() {
  const t = useTranslations("onboarding.verifyEmail");
  const router = useRouter();
  const [status, setStatus] = useState<"signing-in" | "needs-login">(
    "signing-in",
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await authClient.getSession();
        if (!data?.user) throw new Error("no session");
        const path = await resolveSellerHomePath(data.user.role);
        if (!cancelled) router.replace(path);
      } catch {
        if (!cancelled) setStatus("needs-login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (status === "signing-in") {
    return (
      <>
        <h1 className="text-2xl font-bold text-gray-900">
          {t("successTitle")}
        </h1>
        <p role="status" className="text-sm text-gray-600">
          {t("signingIn")}
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900">{t("successTitle")}</h1>
      <p className="text-sm text-gray-600">{t("successBody")}</p>
      <Link
        href="/login"
        className="text-emerald-600 font-medium hover:underline"
      >
        {t("backToLogin")}
      </Link>
    </>
  );
}
