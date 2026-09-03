"use client";

import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { InquirySubmissionInput } from "@biasmarket/validation";

export function useSubmitInquiry(fallbackErrorMessage?: string) {
  return useMutation({
    mutationFn: (values: InquirySubmissionInput) =>
      apiClient.contact.create(
        {
          name: values.name,
          email: values.email,
          company: values.company || undefined,
          inquiryType: values.inquiryType,
          message: values.message,
        },
        { fallbackErrorMessage },
      ),
  });
}
