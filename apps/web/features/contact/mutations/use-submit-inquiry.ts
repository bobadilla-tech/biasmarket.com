"use client";

import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { InquirySubmissionInput } from "../schemas/inquiry-submission.schema";

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
