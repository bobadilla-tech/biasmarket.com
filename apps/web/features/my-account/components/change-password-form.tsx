"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChangePassword } from "../mutations/use-change-password";
import {
  type ChangePasswordInput,
  changePasswordSchema,
} from "../schemas/change-password.schema";

export function ChangePasswordForm() {
  const t = useTranslations("dashboard.account.changePassword");
  const tCommon = useTranslations("common");

  const changePassword = useChangePassword(tCommon("networkError"));

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onSubmit = handleSubmit((values) => {
    changePassword.mutate(values, {
      onSuccess: () => reset(),
    });
  });

  return (
    <Card className="rounded-[26px] border-[#eadcf8] bg-white py-0 shadow-sm">
      <CardHeader className="px-5 pt-5">
        <CardTitle className="text-base font-semibold text-[#2d1649]">
          {t("title")}
        </CardTitle>
        <CardDescription className="text-sm text-[#8f7da8]">
          {t("description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-[#927fac]">
              {t("currentLabel")}
            </label>
            <Input
              type="password"
              {...register("currentPassword")}
              className="h-11 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-[#927fac]">
              {t("newLabel")}
            </label>
            <Input
              type="password"
              {...register("newPassword")}
              className="h-11 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-[#927fac]">
              {t("confirmLabel")}
            </label>
            <Input
              type="password"
              {...register("confirmPassword")}
              className="h-11 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
            />
            {errors.confirmPassword
              ? <p className="text-sm text-[#b24368]">{t("mismatch")}</p>
              : null}
          </div>

          {changePassword.isError
            ? (
              <p className="text-sm text-[#b24368]">
                {changePassword.error instanceof Error
                  ? changePassword.error.message
                  : tCommon("networkError")}
              </p>
            )
            : null}

          <Button
            type="submit"
            disabled={isSubmitting || changePassword.isPending}
            className="h-11 rounded-2xl bg-[#6d28d9] px-5 text-sm font-semibold text-white hover:bg-[#5b21b6]"
          >
            {changePassword.isSuccess
              ? t("saved")
              : changePassword.isPending
              ? t("submitting")
              : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
