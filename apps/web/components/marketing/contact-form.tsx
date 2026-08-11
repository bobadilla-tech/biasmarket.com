"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  type InquirySubmissionInput,
  inquirySubmissionSchema,
  useSubmitInquiry,
} from "@/features/contact";

const inputClass =
  "w-full rounded-lg border border-black/40 bg-background px-4 py-2.5 text-sm text-foreground transition placeholder:text-muted-foreground focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/60";

export function ContactForm() {
  const t = useTranslations("marketing.contactPage.form");
  const [success, setSuccess] = useState(false);
  const submitInquiry = useSubmitInquiry(t("error"));

  const { register, handleSubmit } = useForm<InquirySubmissionInput>({
    resolver: zodResolver(inquirySubmissionSchema),
    defaultValues: {
      name: "",
      email: "",
      company: "",
      inquiryType: "general",
      message: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await submitInquiry.mutateAsync(values);
      setSuccess(true);
    } catch {
      // error surfaces via submitInquiry.error
    }
  });

  if (success) {
    return (
      <div className="rounded-2xl border border-black/10 p-8 text-center">
        <p className="font-semibold">{t("success")}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-black/10 p-8"
    >
      <div>
        <label htmlFor="name" className="mb-2 block text-sm font-medium">
          {t("name")}
        </label>
        <input
          id="name"
          required
          className={inputClass}
          {...register("name")}
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-medium">
          {t("email")}
        </label>
        <input
          id="email"
          type="email"
          required
          className={inputClass}
          {...register("email")}
        />
      </div>

      <div>
        <label htmlFor="company" className="mb-2 block text-sm font-medium">
          {t("company")}
        </label>
        <input id="company" className={inputClass} {...register("company")} />
      </div>

      <div>
        <label htmlFor="inquiryType" className="mb-2 block text-sm font-medium">
          {t("inquiryType")}
        </label>
        <Select
          id="inquiryType"
          className="w-full"
          selectClassName={inputClass.replace("px-4", "pl-4")}
          {...register("inquiryType")}
        >
          <option value="general">{t("inquiryGeneral")}</option>
          <option value="technical">{t("inquiryTechnical")}</option>
          <option value="pricing">{t("inquiryPricing")}</option>
          <option value="partnership">{t("inquiryPartnership")}</option>
          <option value="other">{t("inquiryOther")}</option>
        </Select>
      </div>

      <div>
        <label htmlFor="message" className="mb-2 block text-sm font-medium">
          {t("message")}
        </label>
        <textarea
          id="message"
          rows={5}
          required
          className={inputClass}
          {...register("message")}
        />
      </div>

      {submitInquiry.isError && (
        <p className="text-sm text-red-400">
          {submitInquiry.error instanceof Error
            ? submitInquiry.error.message
            : t("error")}
        </p>
      )}

      <button
        type="submit"
        disabled={submitInquiry.isPending}
        className={buttonVariants({ className: "h-11 w-full px-6" })}
      >
        {submitInquiry.isPending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
