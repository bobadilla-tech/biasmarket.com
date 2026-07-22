"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

const inputClass =
  "w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/30 placeholder:text-muted-foreground";

export function ContactForm() {
  const t = useTranslations("marketing.contactPage.form");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);

    try {
      await apiFetch(
        "/contact",
        {
          method: "POST",
          body: JSON.stringify({
            name: form.get("name"),
            email: form.get("email"),
            company: form.get("company") || undefined,
            inquiryType: form.get("inquiryType"),
            message: form.get("message"),
          }),
        },
        t("error"),
      );
      setSuccess(true);
      e.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-white/10 p-8 text-center">
        <p className="font-semibold">{t("success")}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-white/10 p-8"
    >
      <div>
        <label htmlFor="name" className="mb-2 block text-sm font-medium">
          {t("name")}
        </label>
        <input id="name" name="name" required className={inputClass} />
      </div>

      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-medium">
          {t("email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="company" className="mb-2 block text-sm font-medium">
          {t("company")}
        </label>
        <input id="company" name="company" className={inputClass} />
      </div>

      <div>
        <label
          htmlFor="inquiryType"
          className="mb-2 block text-sm font-medium"
        >
          {t("inquiryType")}
        </label>
        <select id="inquiryType" name="inquiryType" className={inputClass}>
          <option value="general">{t("inquiryGeneral")}</option>
          <option value="technical">{t("inquiryTechnical")}</option>
          <option value="pricing">{t("inquiryPricing")}</option>
          <option value="partnership">{t("inquiryPartnership")}</option>
          <option value="other">{t("inquiryOther")}</option>
        </select>
      </div>

      <div>
        <label htmlFor="message" className="mb-2 block text-sm font-medium">
          {t("message")}
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          required
          className={inputClass}
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className={buttonVariants({ className: "h-11 w-full px-6" })}
      >
        {loading ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
