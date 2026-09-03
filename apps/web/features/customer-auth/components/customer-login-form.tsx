"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  FormErrorSummary,
  FormField,
  formErrorMessage,
} from "@/components/shared/form-a11y";
import { useCustomerLogin } from "../mutations/use-customer-login";
import {
  type CustomerLoginInput,
  customerLoginSchema,
} from "@biasmarket/validation";

const inputClassName =
  "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-base text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600 md:text-sm";

export function CustomerLoginForm({ slug }: { slug: string }) {
  const t = useTranslations("storefront.loginPage");
  const router = useRouter();
  const login = useCustomerLogin(slug);
  const tCommon = useTranslations("common");

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CustomerLoginInput>({
    resolver: zodResolver(customerLoginSchema),
    defaultValues: { phone: "" },
  });

  const onSubmit = async (values: CustomerLoginInput) => {
    try {
      await login.mutateAsync(values);
      router.push(`/store/${slug}/account`);
    } catch (err) {
      setError("root", {
        message: err instanceof Error ? err.message : t("invalidCredentials"),
      });
    }
  };

  return (
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <FormErrorSummary
          id="customer-login-error-summary"
          title={tCommon("formErrorsSummary")}
          messages={[
            errors.phone || errors.password ? tCommon("formErrorsSummary") : "",
            errors.root?.message ?? "",
          ].filter(Boolean)}
        />
        <FormField
          id="customer-login-phone"
          label={t("phonePlaceholder")}
          error={formErrorMessage(errors.phone, t("phoneRequired"))}
        >
          {(props) => (
            <Controller
              control={control}
              name="phone"
              render={({ field }) => (
                <PhoneInput
                  {...props}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={t("phonePlaceholder")}
                  selectClassName={inputClassName}
                  inputClassName={inputClassName}
                  countryId="customer-login-phone-country"
                />
              )}
            />
          )}
        </FormField>

        <FormField
          id="customer-login-password"
          label={t("passwordPlaceholder")}
          error={formErrorMessage(errors.password, t("passwordRequired"))}
        >
          {(props) => (
            <input
              {...props}
              placeholder={t("passwordPlaceholder")}
              type="password"
              autoComplete="current-password"
              className={inputClassName}
              {...register("password")}
            />
          )}
        </FormField>

        <Link
          href={`/store/${slug}/account/forgot-password`}
          className="store-theme-link text-sm font-medium -mt-3"
        >
          {t("forgotPasswordLink")}
        </Link>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
        >
          {isSubmitting ? t("submitting") : t("submit")}
        </button>
      </form>
    </div>
  );
}
