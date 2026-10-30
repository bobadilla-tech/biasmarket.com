import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthEditorialLayout } from "@/features/auth/components/auth-editorial-layout";
import { LoginForm } from "@/features/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding.login" });
  return { title: t("title") };
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding.login" });

  return (
    <AuthEditorialLayout formSide="right" formLabel={t("title")}>
      <LoginForm />
    </AuthEditorialLayout>
  );
}
