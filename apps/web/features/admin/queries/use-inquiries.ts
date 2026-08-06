"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const inquiriesKeys = {
  all: ["admin-inquiries"] as const,
};

export function useInquiries(fallbackErrorMessage?: string) {
  return useQuery({
    queryKey: inquiriesKeys.all,
    queryFn: () => apiClient.contact.findAll({ fallbackErrorMessage }),
  });
}
