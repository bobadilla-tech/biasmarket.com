"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Link, useRouter } from "@/i18n/navigation";

export default function LoginPage() {
  const t = useTranslations("onboarding.login");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message ?? t("invalidCredentials"));
      return;
    }
    if (data.user.role === "admin") {
      router.push("/admin");
      return;
    }
    router.push("/onboarding/create-store");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-5">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>

        <input
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600"
        />
        <input
          placeholder={t("passwordPlaceholder")}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600"
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
        >
          {loading ? t("submitting") : t("submit")}
        </button>

        <p className="text-center text-sm text-gray-500">
          {t("noAccount")}{" "}
          <Link
            href="/onboarding"
            className="text-emerald-600 font-medium hover:underline"
          >
            {t("signUpLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
