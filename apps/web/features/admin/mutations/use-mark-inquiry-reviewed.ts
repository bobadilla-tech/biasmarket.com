"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { inquiriesApi } from "../api/inquiries.api";
import { inquiriesKeys } from "../queries/use-inquiries";

export function useMarkInquiryReviewed(fallbackErrorMessage?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      inquiriesApi.markReviewed(id, fallbackErrorMessage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inquiriesKeys.all });
    },
  });
}
