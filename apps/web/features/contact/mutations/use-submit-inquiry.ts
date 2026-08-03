"use client";

import { useMutation } from "@tanstack/react-query";
import { contactApi } from "../api/contact.api";
import type { InquirySubmissionInput } from "../schemas/inquiry-submission.schema";

export function useSubmitInquiry(fallbackErrorMessage?: string) {
  return useMutation({
    mutationFn: (values: InquirySubmissionInput) =>
      contactApi.submit(values, fallbackErrorMessage),
  });
}
