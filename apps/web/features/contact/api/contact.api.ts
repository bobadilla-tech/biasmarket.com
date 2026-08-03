import { apiFetch } from "@/lib/api";
import type { InquirySubmissionInput } from "../schemas/inquiry-submission.schema";

export const contactApi = {
  submit(values: InquirySubmissionInput, fallbackErrorMessage?: string) {
    return apiFetch(
      "/contact",
      {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          company: values.company || undefined,
          inquiryType: values.inquiryType,
          message: values.message,
        }),
      },
      fallbackErrorMessage,
    );
  },
};
