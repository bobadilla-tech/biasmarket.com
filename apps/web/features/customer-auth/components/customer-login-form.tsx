"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { PhoneInput } from "@/components/ui/phone-input";
import { useCustomerLogin } from "../mutations/use-customer-login";
import {
  type CustomerLoginInput,
  customerLoginSchema,
} from "../schemas/login.schema";

const inputClassName =
  "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600";

export function CustomerLoginForm({ slug }: { slug: string }) {
  const t = useTranslations("storefront.loginPage");
  const router = useRouter();
  const login = useCustomerLogin(slug);

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
        <div className="flex flex-col gap-1.5">
          <Controller
            control={control}
            name="phone"
            render={({ field }) => (
              <PhoneInput
                value={field.value}
                onChange={field.onChange}
                placeholder={t("phonePlaceholder")}
                selectClassName={inputClassName}
                inputClassName={inputClassName}
              />
            )}
          />
          {errors.phone
            ? <p className="text-sm text-red-500">{t("phoneRequired")}</p>
            : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <input
            placeholder={t("passwordPlaceholder")}
            type="password"
            className={inputClassName}
            {...register("password")}
          />
          {errors.password
            ? <p className="text-sm text-red-500">{t("passwordRequired")}</p>
            : null}
        </div>

        <Link
          href={`/store/${slug}/account/forgot-password`}
          className="store-theme-link text-sm font-medium -mt-3"
        >
          {t("forgotPasswordLink")}
        </Link>

        {errors.root
          ? <p className="text-sm text-red-500">{errors.root.message}</p>
          : null}

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
