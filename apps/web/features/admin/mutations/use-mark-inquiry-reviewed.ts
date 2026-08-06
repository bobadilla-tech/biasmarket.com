"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { inquiriesKeys } from "../queries/use-inquiries";

export function useMarkInquiryReviewed(fallbackErrorMessage?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.contact.markReviewed(id, { fallbackErrorMessage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inquiriesKeys.all });
    },
  });
}
