"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  formErrorMessage,
  FormErrorSummary,
  FormField,
} from "@/components/shared/form-a11y";
import {
  type InquirySubmissionInput,
  inquirySubmissionSchema,
  useSubmitInquiry,
} from "@/features/contact";

const inputClass =
  "w-full rounded-lg border border-black/40 bg-background px-4 py-2.5 text-base text-foreground transition placeholder:text-muted-foreground focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/60 md:text-sm";

export function ContactForm() {
  const t = useTranslations("marketing.contactPage.form");
  const tCommon = useTranslations("common");
  const [success, setSuccess] = useState(false);
  const successRef = useRef<HTMLParagraphElement>(null);
  const submitInquiry = useSubmitInquiry(t("error"));

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InquirySubmissionInput>({
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

  useEffect(() => {
    if (success) successRef.current?.focus();
  }, [success]);

  if (success) {
    return (
      <div className="rounded-2xl border border-black/10 p-8 text-center">
        <p
          ref={successRef}
          tabIndex={-1}
          role="status"
          className="font-semibold outline-none"
        >
          {t("success")}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-labelledby="contact-form-heading"
      className="flex flex-col gap-4 rounded-2xl border border-black/10 p-8"
    >
      <h2 id="contact-form-heading" className="sr-only">
        {t("heading")}
      </h2>
      <FormErrorSummary
        id="contact-error-summary"
        title={tCommon("formErrorsSummary")}
        messages={[
          errors.name || errors.email || errors.message
            ? tCommon("formErrorsSummary")
            : "",
          submitInquiry.isError
            ? submitInquiry.error instanceof Error
              ? submitInquiry.error.message
              : t("error")
            : "",
        ].filter(Boolean)}
      />
      <FormField
        id="contact-name"
        label={t("name")}
        error={formErrorMessage(errors.name, t("nameRequired"))}
      >
        {(props) => (
          <input
            {...props}
            required
            className={inputClass}
            {...register("name")}
          />
        )}
      </FormField>
      <FormField
        id="contact-email"
        label={t("email")}
        error={formErrorMessage(errors.email, t("emailInvalid"))}
      >
        {(props) => (
          <input
            {...props}
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            className={inputClass}
            {...register("email")}
          />
        )}
      </FormField>
      <FormField id="contact-company" label={t("company")}>
        {(props) => (
          <input
            {...props}
            autoComplete="organization"
            className={inputClass}
            {...register("company")}
          />
        )}
      </FormField>
      <FormField id="contact-inquiry-type" label={t("inquiryType")}>
        {(props) => (
          <Select
            {...props}
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
        )}
      </FormField>
      <FormField
        id="contact-message"
        label={t("message")}
        error={formErrorMessage(errors.message, t("messageRequired"))}
      >
        {(props) => (
          <textarea
            {...props}
            rows={5}
            required
            className={inputClass}
            {...register("message")}
          />
        )}
      </FormField>

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
